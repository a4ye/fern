import { describe, expect, it } from "bun:test";
import { emailSyncSuccessMessage } from "./copy";

describe("emailSyncSuccessMessage", () => {
    it("uses singular copy for one suggestion", () => {
        expect(
            emailSyncSuccessMessage({
                found: 1,
                hasMore: false,
                initialScanLimited: false,
            }),
        ).toBe("1 update found.");
    });

    it("keeps the empty result brief", () => {
        expect(
            emailSyncSuccessMessage({
                found: 0,
                hasMore: false,
                initialScanLimited: false,
            }),
        ).toBe("No updates found.");
    });

    it("reports remaining work after several suggestions", () => {
        expect(
            emailSyncSuccessMessage({
                found: 3,
                hasMore: true,
                initialScanLimited: false,
            }),
        ).toBe("3 updates found. Sync again to check the remaining emails.");
    });

    it("describes the first sync in plain language", () => {
        expect(
            emailSyncSuccessMessage({
                found: 0,
                hasMore: false,
                initialScanLimited: true,
            }),
        ).toBe("No updates found in your 100 most recent emails.");
    });
});
