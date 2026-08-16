import { describe, expect, it } from "bun:test";
import { settingsBackHref } from "@/components/dashboard/data";

describe("settingsBackHref", () => {
    it("returns to the page the user left, filters and all", () => {
        expect(settingsBackHref("/dashboard?q=acme&sort=name&page=2")).toBe(
            "/dashboard?q=acme&sort=name&page=2",
        );
        expect(settingsBackHref("/dashboard/summer-2026?from=q%3Dacme")).toBe(
            "/dashboard/summer-2026?from=q%3Dacme",
        );
    });

    it("falls back to the lists when there is nowhere to return to", () => {
        expect(settingsBackHref(undefined)).toBe("/dashboard");
        expect(settingsBackHref("")).toBe("/dashboard");
    });

    // The value is written in the URL, so a crafted one must not turn the back
    // button into a way off the site.
    it("refuses anywhere that is not a dashboard page of ours", () => {
        expect(settingsBackHref("https://evil.example/x")).toBe("/dashboard");
        expect(settingsBackHref("//evil.example")).toBe("/dashboard");
        expect(settingsBackHref("/login")).toBe("/dashboard");
        expect(settingsBackHref("/dashboardevil")).toBe("/dashboard");
        expect(settingsBackHref("javascript:alert(1)")).toBe("/dashboard");
    });

    // Settings linking back to itself would be a button that does nothing.
    it("refuses the settings page itself", () => {
        expect(settingsBackHref("/dashboard/settings")).toBe("/dashboard");
        expect(settingsBackHref("/dashboard/settings?from=%2Fdashboard")).toBe(
            "/dashboard",
        );
    });
});
