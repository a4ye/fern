import { describe, expect, it } from "bun:test";
import { readSyncStream, type SyncEvent } from "./sync-stream";
import { initialSyncProgress } from "./progress";

const stream = (events: SyncEvent[], chunkSize: number) => {
    const bytes = new TextEncoder().encode(
        events.map((event) => JSON.stringify(event)).join("\n"),
    );
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                controller.enqueue(bytes.slice(offset, offset + chunkSize));
            }
            controller.close();
        },
    });
};

describe("sync response stream", () => {
    it("handles fragmented UTF-8, heartbeats, and a final line without newline", async () => {
        const progress = initialSyncProgress();
        const result = {
            ok: false,
            reason: "error",
            message: "Connection interrupted…",
        } as const;
        for (const chunkSize of [1, 7, 10_000]) {
            const seen: unknown[] = [];
            const response = await readSyncStream(
                stream(
                    [
                        { type: "progress", progress },
                        { type: "heartbeat" },
                        { type: "result", result },
                    ],
                    chunkSize,
                ),
                (p) => seen.push(p),
            );
            expect(response).toEqual(result);
            expect(seen).toEqual([progress]);
        }
    });

    it("treats a truncated connection as failure even after progress", async () => {
        await expect(
            readSyncStream(
                stream(
                    [{ type: "progress", progress: initialSyncProgress() }],
                    10,
                ),
                () => {},
            ),
        ).rejects.toThrow("before completion");
    });

    it("returns the server's confirmed success", async () => {
        const result = {
            ok: true,
            found: 2,
            scanned: 50,
            remaining: 5,
            hasMore: true,
            initialScanLimited: false,
        } as const;
        expect(
            await readSyncStream(
                stream([{ type: "result", result }], 4),
                () => {},
            ),
        ).toEqual(result);
    });
});
