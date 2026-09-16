import { describe, expect, test } from "bun:test";
import { candidatesFor } from "@/lib/email/candidates";
import type { NormalizedEmail } from "@/lib/email/types";

const email = (fields: Partial<NormalizedEmail>): NormalizedEmail => ({
    id: "m1",
    from: "careers@example.com",
    subject: "",
    snippet: "",
    body: "",
    receivedAt: new Date("2026-09-08T12:00:00Z"),
    ...fields,
});

const companies = (names: string[]) => names.map((company) => ({ company }));

const keptFor = (names: string[], message: NormalizedEmail): string[] =>
    candidatesFor(companies(names), [message]).applications.map(
        (kept) => kept.company,
    );

describe("candidatesFor", () => {
    test("keeps the company the sender's domain names", () => {
        expect(
            keptFor(
                ["Ramp", "Stripe", "Figma"],
                email({ from: "University Careers <no-reply@ramp.com>" }),
            ),
        ).toEqual(["Ramp"]);
    });

    test("keeps a company the email only names in the body", () => {
        expect(
            keptFor(
                ["Ramp", "Stripe"],
                email({
                    from: "no-reply@greenhouse.io",
                    body: "Thank you for applying to Stripe. We have decided...",
                }),
            ),
        ).toEqual(["Stripe"]);
    });

    // The tracked row carries the legal name and the email almost never does.
    test("ignores the words that say a company is a company", () => {
        expect(
            keptFor(
                ["Google LLC", "Acme Inc"],
                email({ subject: "Your Google application" }),
            ),
        ).toEqual(["Google LLC"]);
    });

    // Nobody writes the full registered name in a rejection.
    test("keeps a long name the email only half writes", () => {
        expect(
            keptFor(
                ["Tower Research Capital", "Jane Street Capital"],
                email({ subject: "An update from Tower Research" }),
            ),
        ).toEqual(["Tower Research Capital"]);
    });

    test("does not care how a name is spaced or punctuated", () => {
        expect(
            keptFor(["Point72"], email({ subject: "Point 72 interview" })),
        ).toEqual(["Point72"]);
        expect(
            keptFor(["Point 72"], email({ from: "hr@point72.com" })),
        ).toEqual(["Point 72"]);
    });

    // A single shared word is too little to go on. "American" appears in plenty
    // of mail that has nothing to do with American Express, and a list of
    // thousands would hardly narrow at all if one word were enough.
    test("will not match a long name on one common word alone", () => {
        expect(
            keptFor(
                ["American Express"],
                email({ body: "American football tickets are on sale" }),
            ),
        ).toEqual([]);
    });

    // Companies put a shortened form of their name in their own domain.
    test("keeps a name the sender's domain runs together and cuts short", () => {
        expect(
            keptFor(
                ["Tower Research Capital", "Stripe"],
                email({ from: "recruiting@towerresearch.com" }),
            ),
        ).toEqual(["Tower Research Capital"]);
    });

    // The name is not a whole word here, it is buried in the middle of one, so
    // the glued forms have to be searched for anywhere in the text rather than
    // compared against the words it happens to be split into.
    test("finds a name a domain has buried inside a longer word", () => {
        expect(
            keptFor(
                ["Capital One", "Stripe"],
                email({ from: "careers@capitalonecareers.com" }),
            ),
        ).toEqual(["Capital One"]);
    });

    // A bare word is matched exactly, never as a substring, or a company called
    // "Test" would be a candidate for every email carrying the word "latest".
    test("will not find a short name inside a longer word", () => {
        expect(
            keptFor(
                ["Test"],
                email({ body: "Markets rallied on the latest data" }),
            ),
        ).toEqual([]);
    });

    // Real lists carry junk rows. A name with nothing to search for must match
    // nothing rather than everything.
    test("never matches on a name of a single letter", () => {
        expect(
            keptFor(["a"], email({ subject: "a note about a thing" })),
        ).toEqual([]);
    });

    test("leaves out everyone when the email names nobody tracked", () => {
        expect(
            keptFor(
                ["Ramp", "Stripe"],
                email({ subject: "Your electricity bill is ready" }),
            ),
        ).toEqual([]);
    });

    test("keeps a company named by any email in the batch", () => {
        const kept = candidatesFor(companies(["Ramp", "Stripe", "Figma"]), [
            email({ id: "a", subject: "Ramp interview" }),
            email({ id: "b", subject: "Figma take-home" }),
        ]);

        expect(kept.applications.map((entry) => entry.company)).toEqual([
            "Ramp",
            "Figma",
        ]);
    });

    test("holds the order the applications came in", () => {
        const kept = candidatesFor(companies(["Ramp", "Stripe", "Figma"]), [
            email({ subject: "Figma, Ramp and Stripe all wrote back" }),
        ]);

        expect(kept.applications.map((entry) => entry.company)).toEqual([
            "Ramp",
            "Stripe",
            "Figma",
        ]);
    });

    // Every email carries its whole body, so the ones about nobody tracked are
    // the bulk of what the model would otherwise be charged to read.
    test("drops the emails that name nobody tracked", () => {
        const kept = candidatesFor(companies(["Ramp", "Stripe"]), [
            email({ id: "bill", subject: "Your electricity bill is ready" }),
            email({ id: "real", subject: "Your Ramp application" }),
            email({ id: "news", subject: "The week in review" }),
        ]);

        expect(kept.emails.map((entry) => entry.id)).toEqual(["real"]);
        expect(kept.applications.map((entry) => entry.company)).toEqual([
            "Ramp",
        ]);
    });

    test("holds the order the emails came in", () => {
        const kept = candidatesFor(companies(["Ramp", "Figma"]), [
            email({ id: "first", subject: "Figma take-home" }),
            email({ id: "noise", subject: "Your electricity bill" }),
            email({ id: "second", subject: "Ramp interview" }),
        ]);

        expect(kept.emails.map((entry) => entry.id)).toEqual([
            "first",
            "second",
        ]);
    });

    test("has nothing to offer when there is nothing to match", () => {
        expect(candidatesFor([], [email({})])).toEqual({
            applications: [],
            emails: [],
        });
        expect(candidatesFor(companies(["Ramp"]), [])).toEqual({
            applications: [],
            emails: [],
        });
    });
});
