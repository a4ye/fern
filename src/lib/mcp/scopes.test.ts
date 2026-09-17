import { describe, expect, test } from "bun:test";
import { DEFAULT_SCOPE, SCOPE_READ, SCOPE_WRITE, allowsWrite } from "./scopes";

describe("allowsWrite", () => {
    test("allows a token that asked to write", () => {
        expect(allowsWrite(["openid", SCOPE_READ, SCOPE_WRITE])).toBe(true);
        expect(allowsWrite([SCOPE_WRITE])).toBe(true);
    });

    test("holds a read-only token to reading", () => {
        expect(allowsWrite(["openid", SCOPE_READ])).toBe(false);
        expect(allowsWrite([SCOPE_READ])).toBe(false);
    });

    // Connections made before these scopes existed carry neither, and were
    // granted when every token could write. Narrowing them after the fact would
    // break working setups to no benefit: the grant was already given.
    test("leaves a token that names neither scope alone", () => {
        expect(allowsWrite([])).toBe(true);
        expect(allowsWrite(["openid"])).toBe(true);
        expect(allowsWrite(["openid", "profile", "email"])).toBe(true);
    });

    test("the default a client gets for asking nothing still writes", () => {
        expect(allowsWrite(DEFAULT_SCOPE.split(" "))).toBe(true);
    });
});
