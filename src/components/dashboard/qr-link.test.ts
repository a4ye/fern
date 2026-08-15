import { describe, expect, it } from "bun:test";
import {
    cameraErrorMessage,
    scannedJobLink,
} from "@/components/dashboard/qr-link";
import { URL_MAX } from "@/lib/validation";

describe("scannedJobLink", () => {
    it("accepts and trims HTTP links", () => {
        expect(scannedJobLink("  https://jobs.example.com/role  ")).toEqual({
            ok: true,
            value: "https://jobs.example.com/role",
        });
        expect(scannedJobLink("http://example.com/job").ok).toBe(true);
    });

    it("rejects text and unsafe protocols", () => {
        expect(scannedJobLink("Meet us at booth 12").ok).toBe(false);
        expect(scannedJobLink("javascript:alert(1)").ok).toBe(false);
        expect(scannedJobLink("ftp://example.com/job").ok).toBe(false);
    });

    it("rejects empty and oversized values", () => {
        expect(scannedJobLink("   ").ok).toBe(false);
        expect(
            scannedJobLink(`https://example.com/${"a".repeat(URL_MAX)}`).ok,
        ).toBe(false);
    });
});

describe("cameraErrorMessage", () => {
    const error = (kind: Parameters<typeof cameraErrorMessage>[0]["kind"]) =>
        cameraErrorMessage({ kind, message: "source error", cause: null });

    it("gives actionable permission guidance", () => {
        expect(error("permission-denied")).toContain("browser settings");
        expect(error("security")).toContain("browser settings");
    });

    it("distinguishes missing and unsupported cameras", () => {
        expect(error("no-camera")).toContain("No camera");
        expect(error("unsupported")).toContain("does not support");
    });

    it("falls back safely for unknown failures", () => {
        expect(error("unknown")).toContain("Could not start");
        expect(error("type-error")).toContain("Could not start");
    });
});
