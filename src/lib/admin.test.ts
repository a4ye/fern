import { describe, expect, it } from "bun:test";
import { isAdmin } from "./admin";

describe("isAdmin", () => {
    it("trusts nobody when the allowlist is missing or empty", () => {
        expect(isAdmin("person@example.com", null)).toBe(false);
        expect(isAdmin("person@example.com", "")).toBe(false);
        expect(isAdmin(undefined, "person@example.com")).toBe(false);
    });

    it("matches exact email addresses without case or whitespace sensitivity", () => {
        expect(
            isAdmin(
                "Person@Example.com",
                "first@example.com, person@example.com ",
            ),
        ).toBe(true);
    });

    it("does not accept partial addresses or wildcard domains", () => {
        expect(isAdmin("person@example.com", "otherperson@example.com")).toBe(
            false,
        );
        expect(isAdmin("person@example.com", "*@example.com")).toBe(false);
    });
});
