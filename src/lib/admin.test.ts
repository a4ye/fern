import { describe, expect, it } from "bun:test";
import { isAdmin } from "./admin";

const verified = (email: string) => ({ email, emailVerified: true });

describe("isAdmin", () => {
    it("trusts nobody when the allowlist is missing or empty", () => {
        expect(isAdmin(verified("person@example.com"), null)).toBe(false);
        expect(isAdmin(verified("person@example.com"), "")).toBe(false);
        expect(isAdmin(undefined, "person@example.com")).toBe(false);
    });

    it("matches exact email addresses without case or whitespace sensitivity", () => {
        expect(
            isAdmin(
                verified("Person@Example.com"),
                "first@example.com, person@example.com ",
            ),
        ).toBe(true);
    });

    it("does not accept partial addresses or wildcard domains", () => {
        expect(
            isAdmin(verified("person@example.com"), "otherperson@example.com"),
        ).toBe(false);
        expect(isAdmin(verified("person@example.com"), "*@example.com")).toBe(
            false,
        );
    });

    // An address the provider never confirmed is a string on a profile, and
    // matching one opens every account in the deployment.
    it("refuses an allowlisted address the provider did not verify", () => {
        expect(
            isAdmin(
                { email: "person@example.com", emailVerified: false },
                "person@example.com",
            ),
        ).toBe(false);
        expect(
            isAdmin({ email: "person@example.com" }, "person@example.com"),
        ).toBe(false);
    });
});
