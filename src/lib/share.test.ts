import { describe, expect, it } from "bun:test";
import {
    LINK_DURATIONS,
    SHARE_TOKEN_BYTES,
    expiryFrom,
    isShareToken,
    linkState,
    newShareToken,
    sharePath,
} from "@/lib/share";

describe("share tokens", () => {
    it("writes 32 bytes as 43 url-safe characters", () => {
        const token = newShareToken();
        expect(token).toHaveLength(43);
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        // Nothing that has to be escaped in a path, or the address a person
        // copies is not the address they paste.
        expect(encodeURIComponent(token)).toBe(token);
        expect(SHARE_TOKEN_BYTES).toBe(32);
    });

    it("does not repeat itself", () => {
        const tokens = new Set(
            Array.from({ length: 500 }, () => newShareToken()),
        );
        expect(tokens.size).toBe(500);
    });

    it("accepts what it makes and nothing else", () => {
        expect(isShareToken(newShareToken())).toBe(true);
        expect(isShareToken("")).toBe(false);
        expect(isShareToken("short")).toBe(false);
        // A padded or unpadded base64 of the wrong length, path traversal, and
        // the characters a query string would carry all have to be turned away
        // before the database is asked about them.
        expect(isShareToken("a".repeat(42))).toBe(false);
        expect(isShareToken("a".repeat(44))).toBe(false);
        expect(isShareToken(`${"a".repeat(42)}=`)).toBe(false);
        expect(isShareToken(`${"a".repeat(42)}/`)).toBe(false);
        expect(isShareToken("../".padEnd(43, "a"))).toBe(false);
        expect(isShareToken(`${"a".repeat(42)}%`)).toBe(false);
    });

    it("hangs a token off /s", () => {
        expect(sharePath("abc")).toBe("/s/abc");
    });
});

describe("link expiry", () => {
    it("gives a never-expiring link no date", () => {
        expect(expiryFrom("never")).toBeNull();
    });

    it("counts each duration forward from now", () => {
        const before = Date.now();
        for (const { value, hours } of LINK_DURATIONS) {
            if (hours === null) continue;
            const expiry = expiryFrom(value);
            expect(expiry).not.toBeNull();
            const ahead = (expiry as Date).getTime() - before;
            expect(ahead).toBeGreaterThan(hours * 3_600_000 - 1_000);
            expect(ahead).toBeLessThan(hours * 3_600_000 + 1_000);
        }
    });
});

describe("linkState", () => {
    const hence = (ms: number) => new Date(Date.now() + ms).toISOString();

    it("reads a live link as active", () => {
        expect(linkState({ expiresAt: null, revokedAt: null })).toBe("active");
        expect(linkState({ expiresAt: hence(60_000), revokedAt: null })).toBe(
            "active",
        );
    });

    it("reads a passed date as expired", () => {
        expect(linkState({ expiresAt: hence(-1_000), revokedAt: null })).toBe(
            "expired",
        );
    });

    // Revoking is the deliberate act and expiring is the passive one, so a link
    // that is both reads as revoked: that is the answer to "why did this stop
    // working", and it is the one the owner chose.
    it("prefers revoked over expired", () => {
        expect(
            linkState({ expiresAt: hence(-1_000), revokedAt: hence(-500) }),
        ).toBe("revoked");
        expect(
            linkState({ expiresAt: hence(60_000), revokedAt: hence(-500) }),
        ).toBe("revoked");
    });
});
