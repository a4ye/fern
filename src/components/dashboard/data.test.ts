import { describe, expect, it } from "bun:test";
import {
    ADMIN_PATH,
    backHref,
    FRIENDS_PATH,
    SETTINGS_PATH,
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
