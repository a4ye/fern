// The browser is the only witness to two of the three readers, so what it says
// about a read is taken on trust. These are the bounds on that trust: what a
// caller may claim, and what it may not.

import { describe, expect, it } from "bun:test";
import { POSTING_READ_MS_MAX, type PostingReadReport } from "@/lib/metrics";
import { postingReadSchema } from "@/lib/validation";

const report = (over: Partial<PostingReadReport> = {}): PostingReadReport => ({
    outcome: "browser",
    attempted: ["browser"],
    source: "greenhouse",
    waitedMs: 240,
    fieldsFilled: 4,
    ...over,
});

const accepts = (over: Partial<PostingReadReport> = {}) =>
    postingReadSchema.safeParse(report(over)).success;

describe("postingReadSchema", () => {
    it("takes an ordinary read", () => {
        expect(accepts()).toBeTrue();
    });

    it("takes a read that fell through every reader and found nothing", () => {
        expect(
            accepts({
                outcome: "missed",
                attempted: ["browser", "extension", "server"],
                source: null,
                fieldsFilled: 0,
            }),
        ).toBeTrue();
    });

    it("takes a posting whose company came only off the address", () => {
        expect(accepts({ source: "none", fieldsFilled: 1 })).toBeTrue();
    });

    it("refuses a reader that filled the form without being attempted", () => {
        expect(
            accepts({ outcome: "server", attempted: ["browser"] }),
        ).toBeFalse();
    });

    it("refuses the same reader counted twice", () => {
        expect(accepts({ attempted: ["browser", "browser"] })).toBeFalse();
    });

    it("refuses a bucket name of the caller's own", () => {
        expect(
            postingReadSchema.safeParse({
                ...report(),
                source: "careers.acme.com",
            }).success,
        ).toBeFalse();
        expect(
            postingReadSchema.safeParse({
                ...report(),
                outcome: "carrier-pigeon",
            }).success,
        ).toBeFalse();
    });

    it("refuses a wait longer than a read could have taken", () => {
        expect(accepts({ waitedMs: POSTING_READ_MS_MAX })).toBeTrue();
        expect(accepts({ waitedMs: POSTING_READ_MS_MAX + 1 })).toBeFalse();
        expect(accepts({ waitedMs: -1 })).toBeFalse();
    });

    it("refuses more filled fields than the form has to fill", () => {
        expect(accepts({ fieldsFilled: 5 })).toBeTrue();
        expect(accepts({ fieldsFilled: 6 })).toBeFalse();
    });
});
