import type { EmailSyncProgress } from "./progress";
import type { SyncResult } from "./sync-result";

export type SyncEvent =
    | { type: "progress"; progress: EmailSyncProgress }
    | { type: "result"; result: SyncResult }
    | { type: "heartbeat" };

// Fetch chunks need not align with JSON lines or UTF-8 character boundaries.
// A closed connection without a terminal result is never a successful sync.
export const readSyncStream = async (
    body: ReadableStream<Uint8Array>,
    onProgress: (progress: EmailSyncProgress) => void,
): Promise<SyncResult> => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffered += decoder.decode(value, { stream: !done });
            const lines = buffered.split("\n");
            buffered = lines.pop() ?? "";
            if (done && buffered.trim()) lines.push(buffered);
            for (const line of lines) {
                if (!line.trim()) continue;
                const event: SyncEvent = JSON.parse(line);
                if (event.type === "progress") onProgress(event.progress);
                if (event.type === "result") return event.result;
            }
            if (done)
                throw new Error("Sync connection ended before completion.");
        }
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
};
