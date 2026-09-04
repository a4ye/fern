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
    test("counts applications by exact calendar day", () => {
        const volume = volumeFrom(
            [at("2026-08-01"), at("2026-08-01"), at("2026-08-03")],
            at("2026-09-03"),
        );

        expect(volume.days).toEqual([
            { date: "2026-08-01", count: 2 },
            { date: "2026-08-03", count: 1 },
        ]);
    });

    test("sorts days before sending them to the graph", () => {
        const volume = volumeFrom(
            [at("2026-08-04"), at("2026-07-30"), at("2026-08-02")],
            at("2026-09-03"),
        );

        expect(volume.days.map((day) => day.date)).toEqual([
            "2026-07-30",
            "2026-08-02",
            "2026-08-04",
        ]);
    });

    test("counts every application it was given", () => {
        const volume = volumeFrom([
            at("2026-08-01"),
            at("2026-08-01"),
            at("2026-08-04"),
        ]);

        expect(volume.total).toBe(3);
    });

    test("carries the date that closes the default view", () => {
        expect(volumeFrom([], at("2026-09-03")).through).toBe("2026-09-03");
    });

    test("has nothing to draw when nothing was sent", () => {
        expect(volumeFrom([], at("2026-09-03"))).toEqual({
            total: 0,
            through: "2026-09-03",
            days: [],
        });
    });
});
