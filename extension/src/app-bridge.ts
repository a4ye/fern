import { extensionApi } from "./api";
import {
    extensionResponse,
    isExtensionImportRequest,
    isExtensionImportResponse,
    type ExtensionImportResponse,
} from "../../src/lib/job-import/protocol";

const sendToPage = (response: ExtensionImportResponse) => {
    window.postMessage(response, window.location.origin);
};

// Announce eagerly, then answer pings as well: the application may hydrate
// before or after this content script runs.
sendToPage(extensionResponse("extension-ready", { status: "ready" }));

window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        !isExtensionImportRequest(event.data)
    ) {
        return;
    }
    const request = event.data;
    if (request.action === "ping") {
        sendToPage(extensionResponse(request.requestId, { status: "ready" }));
        return;
    }

    void extensionApi.runtime
        .sendMessage(request)
        .then((response) => {
            if (isExtensionImportResponse(response)) sendToPage(response);
        })
        .catch(() => {
            sendToPage(
                extensionResponse(request.requestId, {
                    status: "error",
                    message:
                        "The browser extension could not import this page.",
                }),
            );
        });
});

// Results from a visible posting tab return through the background worker.
extensionApi.runtime.onMessage.addListener((message) => {
    if (isExtensionImportResponse(message)) sendToPage(message);
});
