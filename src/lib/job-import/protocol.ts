import type { ScrapedPosting } from "@/lib/job-import/shared";

export const JOB_IMPORT_CHANNEL = "job-tracker-import-v1";

export type ExtensionImportAction = "ping" | "import" | "open-visible";

export type ExtensionImportRequest = {
    channel: typeof JOB_IMPORT_CHANNEL;
    direction: "app-to-extension";
    requestId: string;
    action: ExtensionImportAction;
    url?: string;
};

export type ExtensionImportResponse = {
    channel: typeof JOB_IMPORT_CHANNEL;
    direction: "extension-to-app";
    requestId: string;
    status: "ready" | "opened" | "found" | "missed" | "error";
    posting?: ScrapedPosting;
    message?: string;
};

type ObjectValue = Record<string, unknown>;

const isObject = (value: unknown): value is ObjectValue =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const isExtensionImportRequest = (
    value: unknown,
): value is ExtensionImportRequest =>
    isObject(value) &&
    value["channel"] === JOB_IMPORT_CHANNEL &&
    value["direction"] === "app-to-extension" &&
    typeof value["requestId"] === "string" &&
    (value["action"] === "ping" ||
        value["action"] === "import" ||
        value["action"] === "open-visible") &&
    (value["url"] === undefined || typeof value["url"] === "string");

export const isExtensionImportResponse = (
    value: unknown,
): value is ExtensionImportResponse =>
    isObject(value) &&
    value["channel"] === JOB_IMPORT_CHANNEL &&
    value["direction"] === "extension-to-app" &&
    typeof value["requestId"] === "string" &&
    (value["status"] === "ready" ||
        value["status"] === "opened" ||
        value["status"] === "found" ||
        value["status"] === "missed" ||
        value["status"] === "error");

export const extensionResponse = (
    requestId: string,
    response: Omit<
        ExtensionImportResponse,
        "channel" | "direction" | "requestId"
    >,
): ExtensionImportResponse => ({
    channel: JOB_IMPORT_CHANNEL,
    direction: "extension-to-app",
    requestId,
    ...response,
});
