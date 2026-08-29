import { describe, expect, it } from "bun:test";
import { createLocalDateTimeFormatter } from "@/lib/local-date-time";

describe("local date and time formatting", () => {
    it("uses a 24-hour locale and the selected time zone", () => {
        const format = createLocalDateTimeFormatter("en-GB", "America/Toronto");

        expect(format("2026-08-28T03:04:00.000Z")).toMatchObject({
            dateKey: "2026-08-27",
            time: "23:04",
            compact: "27 Aug 2026, 23:04",
        });
    });

    it("moves a date into the user's local day", () => {
        const format = createLocalDateTimeFormatter("en-US", "Asia/Tokyo");

        expect(format("2026-08-28T23:04:00.000Z")).toMatchObject({
            dateKey: "2026-08-29",
            time: "8:04 AM",
        });
    });

    it("ignores an invalid stored date", () => {
        const format = createLocalDateTimeFormatter("en-CA", "UTC");

        expect(format("not-a-date")).toBeNull();
    });
});
