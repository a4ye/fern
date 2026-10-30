import { describe, expect, it } from "bun:test";
import { createSyncProgress, type EmailSyncProgress } from "./progress";

const tracker = () => {
    let time = 0;
    const events: EmailSyncProgress[] = [];
    const progress = createSyncProgress(
        (event) => events.push(event),
        { groupSize: 25, concurrency: 2 },
        () => time,
    );
    return {
        progress,
        events,
        advance: (ms: number) => {
            time += ms;
        },
    };
};

describe("sync ETA", () => {
    it("starts unknown, then uses a prior without advancing completed work", () => {
        const { progress, events } = tracker();
        progress.start();
        expect(events.at(-1)?.remainingMs).toBeNull();
        progress.discover(100);
        expect(events.at(-1)?.remainingMs).toBeGreaterThan(0);
        expect(events.at(-1)?.checked).toBe(0);
    });

    it("learns fetch speed from measured durations", () => {
        const fast = tracker();
        const slow = tracker();
        for (const run of [fast, slow]) run.progress.discover(100);
        fast.progress.read(25, 0, 100);
        slow.progress.read(25, 0, 10_000);
        expect(fast.events.at(-1)?.remainingMs ?? Number.NaN).toBeLessThan(
            slow.events.at(-1)?.remainingMs ?? Number.NaN,
        );
    });

    it("overlaps two review calls and learns their duration after saving", () => {
        const fast = tracker();
        const slow = tracker();
        for (const [run, duration] of [
            [fast, 1_000],
            [slow, 30_000],
        ] as const) {
            run.progress.discover(100);
            run.progress.read(100, 100, 1_000);
            const first = run.progress.review(25);
            const second = run.progress.review(25);
            // Four groups on two lanes cost two rounds, not four.
            expect(run.events.at(-1)?.remainingMs).toBe(31_000);
            expect(run.events.at(-1)?.checked).toBe(0);
            run.advance(duration);
            second(2);
            first(1);
            expect(run.events.at(-1)).toMatchObject({
                checked: 50,
                reviewed: 50,
                found: 3,
            });
        }
        expect(fast.events.at(-1)?.remainingMs ?? Number.NaN).toBeLessThan(
            slow.events.at(-1)?.remainingMs ?? Number.NaN,
        );
    });

    it("keeps earlier snapshots immutable and ends without a countdown", () => {
        const { progress, events } = tracker();
        progress.discover(10);
        progress.read(10, 0, 100);
        progress.settle(10);
        progress.finish();
        expect(events[0]?.checked).toBe(0);
        expect(events.at(-1)).toMatchObject({
            checked: 10,
            stage: "finishing",
            remainingMs: null,
        });
    });
});
