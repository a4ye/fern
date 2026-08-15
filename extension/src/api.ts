export type BrowserTab = {
    id?: number;
    url?: string;
};

export type MessageSender = {
    tab?: BrowserTab;
    url?: string;
};

type Event<T extends (...args: never[]) => unknown> = {
    addListener(listener: T): void;
};

export type WebExtensionApi = {
    runtime: {
        sendMessage(message: unknown): Promise<unknown>;
        onMessage: Event<
            (
                message: unknown,
                sender: MessageSender,
                sendResponse: (response: unknown) => void,
            ) => boolean | void
        >;
        lastError?: { message?: string };
    };
    tabs: {
        create(options: { url: string; active: boolean }): Promise<BrowserTab>;
        sendMessage(tabId: number, message: unknown): Promise<unknown>;
        onUpdated: Event<
            (
                tabId: number,
                changeInfo: { status?: string },
                tab: BrowserTab,
            ) => void
        >;
        onRemoved: Event<(tabId: number) => void>;
    };
    scripting: {
        executeScript(options: {
            target: { tabId: number };
            files: string[];
        }): Promise<unknown[]>;
    };
};

type ExtensionGlobals = typeof globalThis & {
    browser?: WebExtensionApi;
    chrome?: WebExtensionApi;
};

const globals = globalThis as ExtensionGlobals;
const resolvedApi = globals.browser ?? globals.chrome;

if (!resolvedApi) {
    throw new Error("WebExtension APIs are unavailable.");
}

export const extensionApi: WebExtensionApi = resolvedApi;
