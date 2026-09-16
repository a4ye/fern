import { describe, expect, it } from "bun:test";
import { MAX_EMAILS_PER_SYNC } from "@/lib/limits";
import { emailSyncSuccessMessage } from "./copy";

describe("emailSyncSuccessMessage", () => {
    it("uses singular copy for one suggestion", () => {
        expect(
            emailSyncSuccessMessage({
                found: 1,
                remaining: 0,
                hasMore: false,
                initialScanLimited: false,
            }),
        ).toBe("1 update found.");
    });

    it("keeps the empty result brief", () => {
        expect(
            emailSyncSuccessMessage({
                found: 0,
                remaining: 0,
                hasMore: false,
                initialScanLimited: false,
            }),
        ).toBe("No updates found.");
    });

    it("counts the backlog left in the queue", () => {
        expect(
            emailSyncSuccessMessage({
                found: 3,
                remaining: 420,
                hasMore: true,
                initialScanLimited: false,
            }),
        ).toBe("3 updates found. 420 emails remaining to sync.");
    });

    it("uses singular copy for a backlog of one", () => {
        expect(
            emailSyncSuccessMessage({
                found: 0,
                remaining: 1,
                hasMore: true,
                initialScanLimited: false,
            }),
        ).toBe("No updates found. 1 email remaining to sync.");
    });

    it("falls back when more mail waits but none is queued", () => {
        expect(
            emailSyncSuccessMessage({
                found: 3,
                remaining: 0,
                hasMore: true,
                initialScanLimited: false,
            }),
        ).toBe("3 updates found. Sync again to check the remaining emails.");
    });

    it("describes the first sync in plain language", () => {
        expect(
            emailSyncSuccessMessage({
                found: 0,
                remaining: 0,
                hasMore: false,
                initialScanLimited: true,
            }),
        ).toBe(
            `No updates found in your ${MAX_EMAILS_PER_SYNC} most recent emails.`,
        );
    });
});
