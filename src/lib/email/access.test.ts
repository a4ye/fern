import { describe, expect, it } from "bun:test";
import { isEmailSyncApproved } from "./access";

describe("isEmailSyncApproved", () => {
    it("denies access when the allowlist is missing or empty", () => {
        expect(isEmailSyncApproved("person@example.com", null)).toBe(false);
        expect(isEmailSyncApproved("person@example.com", "")).toBe(false);
        expect(isEmailSyncApproved(undefined, "person@example.com")).toBe(
            false,
        );
    });

    it("matches exact email addresses without case or whitespace sensitivity", () => {
        expect(
            isEmailSyncApproved(
                "Person@Example.com",
                "first@example.com, person@example.com ",
            ),
        ).toBe(true);
    });

    it("does not accept partial addresses or wildcard domains", () => {
        expect(
            isEmailSyncApproved(
                "person@example.com",
                "otherperson@example.com",
            ),
        ).toBe(false);
        expect(isEmailSyncApproved("person@example.com", "*@example.com")).toBe(
            false,
        );
    });
});
