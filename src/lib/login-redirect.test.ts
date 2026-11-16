import { describe, expect, it } from "bun:test";
import { loginHref, safeNext } from "@/lib/login-redirect";

describe("safeNext", () => {
    it("keeps a path on this site with its query and hash", () => {
        expect(safeNext("/dashboard/2026?from=all#top")).toBe(
            "/dashboard/2026?from=all#top",
        );
    });

    it("drops a missing or repeated value", () => {
        expect(safeNext(undefined)).toBeNull();
        expect(safeNext(["/dashboard", "/terms"])).toBeNull();
    });

    it("drops anything that is not a path", () => {
        for (const value of [
            "",
            "dashboard",
            "https://evil.test",
            "javascript:alert(1)",
        ]) {
            expect(safeNext(value)).toBeNull();
        }
    });

    it("drops a path that resolves onto another host", () => {
        for (const value of [
            "//evil.test",
            "/\\evil.test",
            "/\t/evil.test",
            "/\n/evil.test",
            "///evil.test",
        ]) {
            expect(safeNext(value)).toBeNull();
        }
    });

    it("drops the login page itself", () => {
        expect(safeNext("/login")).toBeNull();
        expect(safeNext("/login?next=/dashboard")).toBeNull();
    });
});

describe("loginHref", () => {
    it("leaves the default destination off the URL", () => {
        expect(loginHref("/dashboard")).toBe("/login");
    });

    it("carries any other destination", () => {
        const href = loginHref("/dashboard/2026?from=all");
        expect(href).toBe("/login?next=%2Fdashboard%2F2026%3Ffrom%3Dall");
        const next = new URL(href, "https://x.test").searchParams.get("next");
        expect(safeNext(next ?? undefined)).toBe("/dashboard/2026?from=all");
    });
});
