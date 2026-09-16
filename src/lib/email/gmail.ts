import {
    EmailAuthError,
    EmailHistoryExpiredError,
    EmailMessageUnavailableError,
    type EmailDiscovery,
    type EmailProvider,
    type FetchOptions,
    type NormalizedEmail,
} from "./types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const BODY_LIMIT = 4000;

// The most IDs Gmail will return from one list call, whatever is asked for.
const LIST_PAGE_LIMIT = 500;

type GmailHeader = { name: string; value: string };
type GmailPart = {
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: GmailPart[];
};
type GmailMessage = {
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: GmailPart & { headers?: GmailHeader[] };
};
type GmailProfile = {
    historyId: string;
};
type GmailHistory = {
    id: string;
    messagesAdded?: { message: { id: string } }[];
};

const decodeBase64Url = (data: string): string =>
    Buffer.from(data, "base64url").toString("utf8");

const headerValue = (headers: GmailHeader[], name: string): string => {
    const match = headers.find(
        (header) => header.name.toLowerCase() === name.toLowerCase(),
    );
    return match?.value ?? "";
};

// Gmail nests body parts as a tree. Prefer the plain-text branch; fall back to
// HTML with tags stripped so the classifier still sees the prose.
const extractBody = (part: GmailPart | undefined): string => {
    if (!part) return "";

    const plain = findPart(part, "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);

    const html = findPart(part, "text/html");
    if (html?.body?.data) {
        return decodeBase64Url(html.body.data)
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    return "";
};

const findPart = (part: GmailPart, mimeType: string): GmailPart | undefined => {
    if (part.mimeType === mimeType && part.body?.data) return part;
    for (const child of part.parts ?? []) {
        const found = findPart(child, mimeType);
        if (found) return found;
    }
    return undefined;
};

const gmailErrorMessage = (body: string, status: number): string => {
    try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) return parsed.error.message;
    } catch {
        // Non-JSON error body; fall through to the generic message.
    }
    return `Gmail request failed (${status})`;
};

const authedFetch = async (
    accessToken: string,
    path: string,
    notFound: "history" | "message" | null = null,
): Promise<Response> => {
    const response = await fetch(`${GMAIL_API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) return response;

    const body = await response.text();
    if (response.status === 404) {
        if (notFound === "history") throw new EmailHistoryExpiredError();
        if (notFound === "message") throw new EmailMessageUnavailableError();
    }
    // A 401, or a 403 caused specifically by missing scopes, means the grant is
    // bad and the user must reconnect. Other 403s are configuration problems
    // (e.g. the Gmail API disabled on the Cloud project) and would only mislead
    // the user if reported as an expired login.
    if (
        response.status === 401 ||
        (response.status === 403 &&
            body.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT"))
    ) {
        throw new EmailAuthError();
    }
    throw new Error(gmailErrorMessage(body, response.status));
};

const unique = (values: string[]): string[] => [...new Set(values)];

export const createGmailProvider = (accessToken: string): EmailProvider => {
    const fetchMessages = async (ids: string[]): Promise<NormalizedEmail[]> => {
        const messages = await Promise.all(
            ids.map(async (id): Promise<NormalizedEmail | null> => {
                try {
                    const response = await authedFetch(
                        accessToken,
                        `/messages/${id}?format=full`,
                        "message",
                    );
                    const message = (await response.json()) as GmailMessage;
                    const headers = message.payload?.headers ?? [];
                    const body = extractBody(message.payload).slice(
                        0,
                        BODY_LIMIT,
                    );
                    return {
                        id: message.id,
                        from: headerValue(headers, "From"),
                        subject: headerValue(headers, "Subject"),
                        snippet: message.snippet ?? "",
                        body,
                        receivedAt: new Date(Number(message.internalDate ?? 0)),
                    };
                } catch (error) {
                    if (error instanceof EmailMessageUnavailableError) {
                        return null;
                    }
                    throw error;
                }
            }),
        );
        return messages.filter(
            (message): message is NormalizedEmail => message !== null,
        );
    };

    return {
        async discoverRecent({
            maxResults,
            newerThanDays,
        }: FetchOptions): Promise<EmailDiscovery> {
            // Take the cursor first. Mail arriving during the bounded list has a
            // later history ID and is therefore recovered by the next delta.
            const profileResponse = await authedFetch(accessToken, "/profile");
            const profile = (await profileResponse.json()) as GmailProfile;

            const ids: string[] = [];
            let pageToken = "";

            // A scan wider than one page is walked page by page. Bounded by the
            // page count rather than by the IDs collected, because Gmail may
            // answer with an empty page and a token to follow it.
            const pages = Math.ceil(maxResults / LIST_PAGE_LIMIT);
            for (let page = 0; page < pages; page += 1) {
                const params = new URLSearchParams({
                    // Scoped to the inbox: recruiter status updates land there,
                    // while the user's own outgoing mail (sent-only) and drafts
                    // are excluded. A message sent to oneself keeps the INBOX
                    // label, so it still matches.
                    q: `in:inbox newer_than:${newerThanDays}d`,
                    maxResults: String(
                        Math.min(LIST_PAGE_LIMIT, maxResults - ids.length),
                    ),
                });
                if (pageToken) params.set("pageToken", pageToken);

                const listResponse = await authedFetch(
                    accessToken,
                    `/messages?${params.toString()}`,
                );
                const list = (await listResponse.json()) as {
                    messages?: { id: string }[];
                    nextPageToken?: string;
                };
                for (const message of list.messages ?? []) ids.push(message.id);

                pageToken = list.nextPageToken ?? "";
                if (!pageToken || ids.length >= maxResults) break;
            }

            return {
                messageIds: unique(ids),
                historyId: profile.historyId,
                // A token still in hand means the scan stopped at its ceiling
                // rather than at the end of the inbox.
                hasMore: pageToken !== "",
            };
        },

        async discoverSince(
            historyId: string,
            maxResults: number,
        ): Promise<EmailDiscovery> {
            const params = new URLSearchParams({
                startHistoryId: historyId,
                historyTypes: "messageAdded",
                labelId: "INBOX",
                maxResults: String(maxResults),
            });
            const response = await authedFetch(
                accessToken,
                `/history?${params.toString()}`,
                "history",
            );
            const page = (await response.json()) as {
                history?: GmailHistory[];
                historyId: string;
                nextPageToken?: string;
            };
            const history = page.history ?? [];
            const messageIds = unique(
                history.flatMap((entry) =>
                    (entry.messagesAdded ?? []).map(
                        (addition) => addition.message.id,
                    ),
                ),
            );
            const lastRecordId = history.at(-1)?.id;
            if (page.nextPageToken && !lastRecordId) {
                throw new Error("Gmail returned an invalid history page.");
            }
            return {
                messageIds,
                // Page tokens are deliberately not persisted. The last fully
                // staged history record is a durable cursor for the next call.
                historyId:
                    page.nextPageToken && lastRecordId
                        ? lastRecordId
                        : page.historyId,
                hasMore: Boolean(page.nextPageToken),
            };
        },

        fetchMessages,
    };
};
