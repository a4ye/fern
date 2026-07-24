import {
    EmailAuthError,
    type EmailProvider,
    type FetchOptions,
    type NormalizedEmail,
} from "./types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const BODY_LIMIT = 4000;

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

const findPart = (
    part: GmailPart,
    mimeType: string,
): GmailPart | undefined => {
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
): Promise<Response> => {
    const response = await fetch(`${GMAIL_API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) return response;

    const body = await response.text();
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

export const createGmailProvider = (accessToken: string): EmailProvider => ({
    async fetchRecent({
        maxResults,
        newerThanDays,
    }: FetchOptions): Promise<NormalizedEmail[]> {
        // Scope to the inbox: recruiter status updates land there, while the
        // user's own outgoing mail (sent-only) and drafts are excluded. A
        // message sent to oneself keeps the INBOX label, so it still matches.
        const query = encodeURIComponent(
            `in:inbox newer_than:${newerThanDays}d`,
        );
        const listResponse = await authedFetch(
            accessToken,
            `/messages?maxResults=${maxResults}&q=${query}`,
        );
        const list = (await listResponse.json()) as {
            messages?: { id: string }[];
        };
        const ids = (list.messages ?? []).map((message) => message.id);

        const messages = await Promise.all(
            ids.map(async (id): Promise<NormalizedEmail> => {
                const response = await authedFetch(
                    accessToken,
                    `/messages/${id}?format=full`,
                );
                const message = (await response.json()) as GmailMessage;
                const headers = message.payload?.headers ?? [];
                const body = extractBody(message.payload).slice(0, BODY_LIMIT);
                return {
                    id: message.id,
                    from: headerValue(headers, "From"),
                    subject: headerValue(headers, "Subject"),
                    snippet: message.snippet ?? "",
                    body,
                    receivedAt: new Date(Number(message.internalDate ?? 0)),
                };
            }),
        );
        return messages;
    },
});
