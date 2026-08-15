"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    JOB_IMPORT_CHANNEL,
    isExtensionImportResponse,
    type ExtensionImportAction,
    type ExtensionImportRequest,
    type ExtensionImportResponse,
} from "@/lib/job-import/protocol";

export type ExtensionAvailability = "checking" | "available" | "missing";

type PendingRequest = {
    resolve: (response: ExtensionImportResponse) => void;
    timeout: ReturnType<typeof setTimeout>;
};

const requestId = (): string =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useJobImportExtension = () => {
    const [availability, setAvailability] =
        useState<ExtensionAvailability>("checking");
    const pending = useRef(new Map<string, PendingRequest>());

    useEffect(() => {
        const waiting = pending.current;
        const onMessage = (event: MessageEvent<unknown>) => {
            if (
                event.source !== window ||
                !isExtensionImportResponse(event.data)
            ) {
                return;
            }
            const response = event.data;
            setAvailability("available");
            if (response.status === "opened" || response.status === "ready") {
                return;
            }
            const request = waiting.get(response.requestId);
            if (!request) return;
            clearTimeout(request.timeout);
            waiting.delete(response.requestId);
            request.resolve(response);
        };

        window.addEventListener("message", onMessage);
        const ping: ExtensionImportRequest = {
            channel: JOB_IMPORT_CHANNEL,
            direction: "app-to-extension",
            requestId: requestId(),
            action: "ping",
        };
        window.postMessage(ping, window.location.origin);
        const missingTimer = setTimeout(() => {
            setAvailability((current) =>
                current === "checking" ? "missing" : current,
            );
        }, 600);

        return () => {
            clearTimeout(missingTimer);
            window.removeEventListener("message", onMessage);
            for (const request of waiting.values()) {
                clearTimeout(request.timeout);
            }
            waiting.clear();
        };
    }, []);

    const request = useCallback(
        (action: Exclude<ExtensionImportAction, "ping">, url: string) =>
            new Promise<ExtensionImportResponse>((resolve) => {
                const id = requestId();
                const timeout = setTimeout(
                    () => {
                        pending.current.delete(id);
                        resolve({
                            channel: JOB_IMPORT_CHANNEL,
                            direction: "extension-to-app",
                            requestId: id,
                            status: "error",
                            message: "The browser extension did not respond.",
                        });
                    },
                    action === "open-visible" ? 60000 : 12000,
                );
                pending.current.set(id, { resolve, timeout });
                const message: ExtensionImportRequest = {
                    channel: JOB_IMPORT_CHANNEL,
                    direction: "app-to-extension",
                    requestId: id,
                    action,
                    url,
                };
                window.postMessage(message, window.location.origin);
            }),
        [],
    );

    return {
        availability,
        importFromUrl: (url: string) => request("import", url),
        openAndImport: (url: string) => request("open-visible", url),
    };
};
