import { describe, expect, it } from "bun:test";
import {
    ADMIN_PATH,
    backHref,
    FRIENDS_PATH,
    listRevision,
    SETTINGS_PATH,
    type ApplicationRow,
} from "@/components/dashboard/data";

describe("backHref", () => {
    it("returns to the page the user left, filters and all", () => {
        expect(
            backHref("/dashboard?q=acme&sort=name&page=2", SETTINGS_PATH),
        ).toBe("/dashboard?q=acme&sort=name&page=2");
        expect(
            backHref("/dashboard/summer-2026?from=q%3Dacme", FRIENDS_PATH),
        ).toBe("/dashboard/summer-2026?from=q%3Dacme");
    });

    // One of these pages can be opened from another, and returns to it.
    it("returns to a page that has a back button of its own", () => {
        expect(
            backHref(
                "/dashboard/settings?from=%2Fdashboard%3Fq%3Dacme",
                FRIENDS_PATH,
            ),
        ).toBe("/dashboard/settings?from=%2Fdashboard%3Fq%3Dacme");
    });

    it("falls back to the lists when there is nowhere to return to", () => {
        expect(backHref(undefined, SETTINGS_PATH)).toBe("/dashboard");
        expect(backHref("", ADMIN_PATH)).toBe("/dashboard");
    });

    // The value is written in the URL, so a crafted one must not turn the back
    // button into a way off the site.
    it("refuses anywhere that is not a dashboard page of ours", () => {
        expect(backHref("https://evil.example/x", SETTINGS_PATH)).toBe(
            "/dashboard",
        );
        expect(backHref("//evil.example", SETTINGS_PATH)).toBe("/dashboard");
        expect(backHref("/login", SETTINGS_PATH)).toBe("/dashboard");
        expect(backHref("/dashboardevil", SETTINGS_PATH)).toBe("/dashboard");
        expect(backHref("javascript:alert(1)", SETTINGS_PATH)).toBe(
            "/dashboard",
        );
    });

    // A page linking back to itself would be a button that does nothing.
    it("refuses the page holding the button", () => {
        expect(backHref("/dashboard/settings", SETTINGS_PATH)).toBe(
            "/dashboard",
        );
        expect(
            backHref("/dashboard/settings?from=%2Fdashboard", SETTINGS_PATH),
        ).toBe("/dashboard");
        expect(backHref("/dashboard/friends", FRIENDS_PATH)).toBe("/dashboard");
        expect(backHref("/dashboard/admin?q=ada", ADMIN_PATH)).toBe(
            "/dashboard",
        );
    });
});

describe("listRevision", () => {
    const row = (id: string, updatedAt: string) =>
        ({ id, updatedAt }) as ApplicationRow;

    const MORNING = "2026-09-17T09:00:00.000Z";
    const NOON = "2026-09-17T12:00:00.000Z";

    it("holds still while the list does", () => {
        const applications = [row("a", MORNING), row("b", NOON)];
        expect(listRevision(applications)).toBe(
            listRevision([...applications]),
        );
    });

    it("moves when a row is written to", () => {
        expect(listRevision([row("a", MORNING)])).not.toBe(
            listRevision([row("a", NOON)]),
        );
    });

    it("moves when a row is added or removed", () => {
        expect(listRevision([row("a", NOON)])).not.toBe(
            listRevision([row("a", NOON), row("b", MORNING)]),
        );
    });

    // A count and a timestamp both start with digits, so reading them as one
    // value would let a list of 30 outrank the year it was last written in.
    it("keeps the count from being weighed against a timestamp", () => {
        const many = Array.from({ length: 30 }, (_, index) =>
            row(String(index), MORNING),
        );
        expect(listRevision(many)).not.toBe(
            listRevision(
                many.map((application) => ({
                    ...application,
                    updatedAt: NOON,
                })),
            ),
        );
    });

    it("answers for a list with nothing in it", () => {
        expect(listRevision([])).toBe("0:");
    });
});
