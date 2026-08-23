import { describe, expect, test } from "bun:test";
import { funnelFrom, volumeFrom } from "@/components/dashboard/insights";
import type {
    ApplicationStatus,
    FlowEntry,
    FunnelStageKey,
} from "@/components/dashboard/data";

const entry = (...history: ApplicationStatus[]): FlowEntry => ({
    status: history[history.length - 1],
    history,
});

const stageOf = (flow: FlowEntry[], key: FunnelStageKey) => {
    const stage = funnelFrom(flow).stages.find((one) => one.key === key);
    if (!stage) throw new Error(`no ${key} stage`);
    return stage;
};

describe("funnelFrom", () => {
    test("leaves out what was never sent", () => {
        expect(
            funnelFrom([
                entry("not_applied"),
                entry("not_applied"),
                entry("applied"),
            ]).applied,
        ).toBe(1);
    });

    test("counts a rejection as having heard back", () => {
        expect(stageOf([entry("applied", "rejected")], "replied")).toEqual({
            key: "replied",
            label: "Heard back",
            count: 1,
            percent: 100,
        });
    });

    test("counts being ghosted as sent but never answered", () => {
        const flow = [entry("applied", "ghosted"), entry("applied")];

        expect(funnelFrom(flow).applied).toBe(2);
        expect(stageOf(flow, "replied").count).toBe(0);
    });

    test("counts a stage the application has since moved past", () => {
        const flow = [entry("applied", "interviewing", "rejected")];

        expect(stageOf(flow, "interviewed").count).toBe(1);
    });

    test("counts an offer that was declined or pulled", () => {
        const flow = [
            entry("applied", "offer_declined"),
            entry("applied", "offer_rescinded"),
            entry("applied", "rejected"),
        ];

        expect(stageOf(flow, "offer").count).toBe(2);
    });

    test("takes every share out of what was sent", () => {
        const flow = [
            entry("applied", "interviewing"),
            entry("applied", "rejected"),
            entry("applied"),
            entry("applied"),
            entry("not_applied"),
        ];

        expect(funnelFrom(flow).applied).toBe(4);
        expect(stageOf(flow, "replied").percent).toBe(50);
        expect(stageOf(flow, "interviewed").percent).toBe(25);
    });

    test("reports no share when nothing was sent", () => {
        expect(stageOf([entry("not_applied")], "replied")).toEqual({
            key: "replied",
            label: "Heard back",
            count: 0,
            percent: 0,
        });
    });
});

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe("volumeFrom", () => {
    test("counts a short search day by day, gaps included", () => {
        const volume = volumeFrom([
            at("2026-08-01"),
            at("2026-08-03"),
            at("2026-08-04"),
        ]);

        expect(volume.unit).toBe("day");
        expect(volume.bars).toEqual([
            { label: "Aug 1", start: "2026-08-01", count: 1, days: [] },
            { label: "Aug 2", start: "2026-08-02", count: 0, days: [] },
            { label: "Aug 3", start: "2026-08-03", count: 1, days: [] },
            { label: "Aug 4", start: "2026-08-04", count: 1, days: [] },
        ]);
    });

    test("counts a season by week, from the Monday", () => {
        // Both dates are Saturdays, so each falls in the week of the Monday
        // before it rather than opening one of its own.
        const volume = volumeFrom([at("2026-05-30"), at("2026-08-01")]);

        expect(volume.unit).toBe("week");
        expect(volume.bars[0].start).toBe("2026-05-25");
        expect(volume.bars[volume.bars.length - 1].start).toBe("2026-07-27");
        expect(volume.bars).toHaveLength(10);
    });

    test("breaks a week back down into the days it was sent on", () => {
        const volume = volumeFrom([
            at("2026-05-26"),
            at("2026-05-26"),
            at("2026-05-29"),
            at("2026-08-01"),
        ]);

        expect(volume.unit).toBe("week");
        expect(volume.bars[0].count).toBe(3);
        expect(volume.bars[0].days).toEqual([
            { label: "May 26", count: 2 },
            { label: "May 29", count: 1 },
        ]);
    });

    test("leaves a chart already counting by day undivided", () => {
        const volume = volumeFrom([at("2026-08-01"), at("2026-08-04")]);

        expect(volume.unit).toBe("day");
        expect(volume.bars[0].days).toEqual([]);
    });

    test("counts a search that ran over a year by month", () => {
        const volume = volumeFrom([at("2025-10-15"), at("2026-09-02")]);

        expect(volume.unit).toBe("month");
        expect(volume.bars[0].label).toBe("Oct 2025");
        expect(volume.bars[volume.bars.length - 1].label).toBe("Sep 2026");
        expect(volume.bars).toHaveLength(12);
    });

    test("counts every application it was given", () => {
        const volume = volumeFrom([
            at("2026-08-01"),
            at("2026-08-01"),
            at("2026-08-04"),
        ]);

        expect(volume.total).toBe(3);
        expect(volume.bars[0]).toEqual({
            label: "Aug 1",
            start: "2026-08-01",
            count: 2,
            days: [],
        });
    });

    test("has nothing to draw when nothing was sent", () => {
        expect(volumeFrom([])).toEqual({ total: 0, unit: "week", bars: [] });
    });
});
