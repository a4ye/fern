import { runInboxSync } from "@/lib/email/run-sync";
import { EMAIL_SYNC_COPY } from "@/lib/email/copy";
import type { SyncEvent } from "@/lib/email/sync-stream";

export const POST = async (request: Request) => {
    // This cookie-authenticated mutation replaces a Server Action, so retain
    // same-origin protection before starting inbox reads or model calls.
    if (request.headers.get("origin") !== new URL(request.url).origin) {
        return new Response("Forbidden", { status: 403 });
    }

    const encoder = new TextEncoder();
    let connected = true;
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (event: SyncEvent) => {
                if (connected) {
                    controller.enqueue(
                        encoder.encode(JSON.stringify(event) + "\n"),
                    );
                }
            };
            const heartbeat = setInterval(
                () => send({ type: "heartbeat" }),
                10_000,
            );
            try {
                const result = await runInboxSync((progress) =>
                    send({ type: "progress", progress }),
                );
                send({ type: "result", result });
            } catch {
                send({
                    type: "result",
                    result: {
                        ok: false,
                        reason: "error",
                        message: EMAIL_SYNC_COPY.genericFailure,
                    },
                });
            } finally {
                clearInterval(heartbeat);
                if (connected) controller.close();
            }
        },
        cancel() {
            // Already-running review batches can still save their work. Losing
            // a browser connection must not turn a committed batch into failure.
            connected = false;
        },
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
};
