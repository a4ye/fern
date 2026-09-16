import { describe, expect, test } from "bun:test";
import {
    EMPTY_FIELDS,
    type ApplicationFields,
} from "@/components/dashboard/application-form";
import { mergeImportedApplication } from "@/components/dashboard/merge-imported-application";
import type { ScrapedPosting } from "@/lib/job-import/shared";

const POSTING: ScrapedPosting = {
    company: "Acme",
    role: "Engineer",
    location: "Toronto, ON",
    arrangement: "hybrid",
    pay: "CAD 90,000 to 110,000 yearly",
    payNote: null,
    source: "json-ld",
    employerUrl: null,
};

describe("mergeImportedApplication", () => {
    test("fills fields that the user has not edited", () => {
        const merged = mergeImportedApplication(
            EMPTY_FIELDS,
            POSTING,
            new Set(),
            "USD",
            {},
        );

        expect(merged).toMatchObject({
            company: "Acme",
            role: "Engineer",
            location: "Toronto, ON",
            arrangement: "hybrid",
            payMin: "90000",
            payMax: "110000",
            payCurrency: "CAD",
            payPeriod: "yearly",
        });
    });

    test("preserves every field the user has edited", () => {
        const current: ApplicationFields = {
            ...EMPTY_FIELDS,
            company: "My company name",
            location: "Remote in Canada",
            payCurrency: "USD",
            notes: "Keep this note",
        };
        const merged = mergeImportedApplication(
            current,
            POSTING,
            new Set(["company", "location", "payCurrency"]),
            "USD",
            {},
        );

        expect(merged.company).toBe("My company name");
        expect(merged.location).toBe("Remote in Canada");
        expect(merged.payCurrency).toBe("USD");
        expect(merged.role).toBe("Engineer");
        expect(merged.notes).toBe("Keep this note");
    });

    test("pays in the currency of the country the posting was placed in", () => {
        const merged = mergeImportedApplication(
            EMPTY_FIELDS,
            { ...POSTING, pay: "90,000 to 110,000 yearly" },
            new Set(),
            "USD",
            {},
            "CA",
        );

        expect(merged.payCurrency).toBe("CAD");
        expect(merged.payMin).toBe("90000");
    });

    test("still fills a currency where the posting states no pay at all", () => {
        const merged = mergeImportedApplication(
            EMPTY_FIELDS,
            { ...POSTING, pay: null },
            new Set(),
            "USD",
            {},
            "DE",
        );

        expect(merged.payCurrency).toBe("EUR");
        expect(merged.payMin).toBe("");
    });

    test("lets a stated currency outrank the country and the country the default", () => {
        const stated = mergeImportedApplication(
            EMPTY_FIELDS,
            POSTING,
            new Set(),
            "GBP",
            {},
            "JP",
        );
        const unknownCountry = mergeImportedApplication(
            EMPTY_FIELDS,
            { ...POSTING, pay: "90,000 yearly" },
            new Set(),
            "GBP",
            {},
            null,
        );

        expect(stated.payCurrency).toBe("CAD");
        expect(unknownCountry.payCurrency).toBe("GBP");
    });

    test("clears stale unedited values when a later posting omits them", () => {
        const current: ApplicationFields = {
            ...EMPTY_FIELDS,
            company: "Previous company",
            role: "Previous role",
            location: "Previous location",
        };
        const merged = mergeImportedApplication(
            current,
            {
                ...POSTING,
                company: null,
                role: null,
                location: null,
                arrangement: null,
                pay: null,
            },
            new Set(),
            "USD",
            {},
        );

        expect(merged.company).toBe("");
        expect(merged.role).toBe("");
        expect(merged.location).toBe("");
        expect(merged.arrangement).toBeNull();
        expect(merged.payMin).toBe("");
        expect(merged.payMax).toBe("");
    });
});
