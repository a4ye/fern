import { describe, expect, test } from "bun:test";
import {
    activityGridFrom,
    activityLevel,
    calendarYearRange,
    calendarYearsFrom,
    trailingYearRange,
} from "@/components/dashboard/application-activity-grid";
import type { Volume } from "@/components/dashboard/data";

const volume: Volume = {
    total: 4,
    through: "2026-09-03",
    days: [
        { date: "2022-05-01", count: 1 },
        { date: "2026-08-01", count: 2 },
        { date: "2026-08-04", count: 1 },
    ],
};

describe("activity ranges", () => {
    test("makes the default view the 365 days through today", () => {
        expect(trailingYearRange("2026-09-03")).toEqual({
            start: "2025-09-04",
            end: "2026-09-03",
        });
    });

    test("makes historical views whole calendar years", () => {
        expect(calendarYearRange(2024)).toEqual({
            start: "2024-01-01",
            end: "2024-12-31",
        });
    });

    test("offers every past year through the list's earliest one", () => {
        expect(calendarYearsFrom(volume)).toEqual([
            2026, 2025, 2024, 2023, 2022,
        ]);
    });
});

describe("activityGridFrom", () => {
    test("draws every view as 53 complete week columns", () => {
        const grid = activityGridFrom(
            volume,
            trailingYearRange(volume.through),
        );

        expect(grid.weeks).toBe(53);
        expect(grid.cells).toHaveLength(371);
        expect(grid.cells[0].visible).toBe(false);
        expect(grid.cells[grid.cells.length - 1].visible).toBe(false);
    });

    test("counts only applications inside the selected range", () => {
        const grid = activityGridFrom(volume, calendarYearRange(2026));

        expect(grid.total).toBe(3);
        expect(grid.cells.find((cell) => cell.date === "2022-05-01")).toBe(
            undefined,
        );
    });

    test("marks the first month and later month boundaries", () => {
        const grid = activityGridFrom(volume, {
            start: "2026-08-10",
            end: "2026-09-03",
        });

        expect(grid.months).toEqual([
            { column: 0, label: "Aug" },
            { column: 3, label: "Sep" },
        ]);
        expect(grid.range).toBe("Aug 10, 2026 to Sep 3, 2026");
    });

    test("drops a leading month label the next one would collide with", () => {
        const grid = activityGridFrom(volume, trailingYearRange("2026-09-22"));

        expect(grid.months[0]).toEqual({ column: 1, label: "Oct" });
    });

    test("keeps one label for a month the range opens on", () => {
        const grid = activityGridFrom(volume, calendarYearRange(2026));

        expect(grid.months[0]).toEqual({ column: 0, label: "Jan" });
        expect(
            grid.months.filter((month) => month.label === "Jan"),
        ).toHaveLength(1);
    });

    test("describes each visible square with its count and exact date", () => {
        const grid = activityGridFrom(volume, {
            start: "2026-08-01",
            end: "2026-08-01",
        });

        expect(grid.cells[6].description).toBe(
            "2 applications on Saturday, August 1, 2026",
        );
    });

    test("caps the color scale at four applications", () => {
        expect([0, 1, 2, 3, 4, 8].map(activityLevel)).toEqual([
            0, 1, 2, 3, 4, 4,
        ]);
    });
});
