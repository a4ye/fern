import { extensionApi, type MessageSender } from "./api";
import {
    JOB_IMPORT_CHANNEL,
    extensionResponse,
    isExtensionImportRequest,
    type ExtensionImportRequest,
    type ExtensionImportResponse,
} from "../../src/lib/job-import/protocol";
import {
    EMPTY_POSTING,
    employerLink,
    greenhouseIds,
    hasPostingSuggestion,
    isScrapedPosting,
    parseGreenhouseJob,
    parsePosting,
    simplifyClickUrl,
    withUrlFallback,
    type ScrapedPosting,
} from "../../src/lib/job-import/shared";
import { readPostingHtml } from "../../src/lib/job-import/response";

const FETCH_TIMEOUT_MS = 10_000;

type PendingVisibleImport = {
    appTabId: number;
    requestId: string;
    injecting: boolean;
};

const visibleImports = new Map<number, PendingVisibleImport>();

const privateIpv4 = (hostname: string): boolean => {
    const parts = hostname.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
        return false;
    }
    return (
        parts[0] === 10 ||
        parts[0] === 127 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168)
    );
};

const publicWebUrl = (rawUrl: string): URL | null => {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (url.username || url.password) return null;
        const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        if (
            host === "localhost" ||
            host.endsWith(".localhost") ||
            host.endsWith(".local") ||
            host === "::1" ||
            (host.includes(":") &&
                (host.startsWith("fc") ||
                    host.startsWith("fd") ||
                    host.startsWith("fe80:"))) ||
            privateIpv4(host)
        ) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
};

// A browser is not allowed to read a redirect it did not follow, so this one is
// followed and the address it settled on is the answer. The page that arrives is
// the employer's, and nothing here wants it, so the body is dropped unread.
const resolveEmployerLink = async (
    clickUrl: string,
): Promise<string | null> => {
    try {
        const response = await fetch(clickUrl, {
            credentials: "omit",
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        void response.body?.cancel();
        return employerLink(response.url);
    } catch {
        return null;
    }
};

const fetchPosting = async (url: URL): Promise<ScrapedPosting> => {
    const greenhouse = greenhouseIds(url);
    if (greenhouse) {
        try {
            const apiResponse = await fetch(
                `https://boards-api.greenhouse.io/v1/boards/${greenhouse.slug}/jobs/${greenhouse.id}`,
                {
                    credentials: "omit",
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                },
            );
            if (apiResponse.ok) {
                const posting = parseGreenhouseJob(await apiResponse.json());
                if (posting) return withUrlFallback(posting, url);
            }
        } catch {
            // The public page below remains a useful fallback.
        }
    }

    // Started alongside the page read rather than after it, so an aggregator
    // link costs one wait instead of two.
    const clickUrl = simplifyClickUrl(url);
    const employer = clickUrl ? resolveEmployerLink(clickUrl) : null;

    const response = await fetch(url, {
        credentials: "omit",
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return EMPTY_POSTING;
    const html = await readPostingHtml(response);
    if (!html) return EMPTY_POSTING;
    return {
        ...withUrlFallback(parsePosting(html), url),
        employerUrl: employer ? await employer : null,
    };
};

const resultFor = (
    requestId: string,
    posting: ScrapedPosting,
): ExtensionImportResponse =>
    extensionResponse(requestId, {
        status: hasPostingSuggestion(posting) ? "found" : "missed",
        posting,
    });

const deliverToApp = async (
    pending: PendingVisibleImport,
    response: ExtensionImportResponse,
) => {
    try {
        await extensionApi.tabs.sendMessage(pending.appTabId, response);
    } catch {
        // The application tab may have been closed while the posting loaded.
    }
};

const openVisibleImport = async (
    request: ExtensionImportRequest,
    appTabId: number,
    url: URL,
): Promise<ExtensionImportResponse> => {
    const tab = await extensionApi.tabs.create({
        url: url.toString(),
        active: true,
    });
    if (tab.id === undefined) {
        return extensionResponse(request.requestId, {
            status: "error",
            message: "The posting tab could not be opened.",
        });
    }
    visibleImports.set(tab.id, {
        appTabId,
        requestId: request.requestId,
        injecting: false,
    });
    return extensionResponse(request.requestId, { status: "opened" });
};

const handleRequest = async (
    request: ExtensionImportRequest,
    sender: MessageSender,
): Promise<ExtensionImportResponse> => {
    if (request.action === "ping") {
        return extensionResponse(request.requestId, { status: "ready" });
    }
    const url = request.url ? publicWebUrl(request.url) : null;
    if (!url) {
        return extensionResponse(request.requestId, {
            status: "error",
            message: "Use a public http:// or https:// posting URL.",
        });
    }
    if (request.action === "open-visible") {
        const appTabId = sender.tab?.id;
        if (appTabId === undefined) {
            return extensionResponse(request.requestId, {
                status: "error",
                message: "The Job Tracker tab could not be found.",
            });
        }
        return openVisibleImport(request, appTabId, url);
    }

    try {
        return resultFor(request.requestId, await fetchPosting(url));
    } catch {
        return resultFor(request.requestId, EMPTY_POSTING);
    }
};

type VisibleResult = {
    channel: typeof JOB_IMPORT_CHANNEL;
    internal: "visible-result";
    posting: ScrapedPosting;
};

const isVisibleResult = (value: unknown): value is VisibleResult => {
    if (typeof value !== "object" || value === null) return false;
    const result = value as Record<string, unknown>;
    return (
        result["channel"] === JOB_IMPORT_CHANNEL &&
        result["internal"] === "visible-result" &&
        isScrapedPosting(result["posting"])
    );
};

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isVisibleResult(message)) {
        const tabId = sender.tab?.id;
        const pending =
            tabId === undefined ? undefined : visibleImports.get(tabId);
        if (tabId !== undefined) visibleImports.delete(tabId);
        if (pending) {
            void deliverToApp(
                pending,
                resultFor(pending.requestId, message.posting),
            );
        }
        return;
    }
    if (!isExtensionImportRequest(message)) return;
    void handleRequest(message, sender).then(sendResponse);
    return true;
});

extensionApi.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const pending = visibleImports.get(tabId);
    if (!pending || pending.injecting || changeInfo.status !== "complete")
        return;
    pending.injecting = true;
    setTimeout(() => {
        void extensionApi.scripting
            .executeScript({
                target: { tabId },
                files: ["posting-reader.js"],
            })
            .catch(() => {
                visibleImports.delete(tabId);
                return deliverToApp(
                    pending,
                    extensionResponse(pending.requestId, {
                        status: "error",
                        message: "The opened posting could not be read.",
                    }),
                );
            });
    }, 500);
});

extensionApi.tabs.onRemoved.addListener((tabId) => {
    const pending = visibleImports.get(tabId);
    if (!pending) return;
    visibleImports.delete(tabId);
    void deliverToApp(
        pending,
        extensionResponse(pending.requestId, {
            status: "error",
            message: "The posting tab was closed before it could be imported.",
        }),
    );
});
