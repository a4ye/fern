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
        );

        expect(merged.company).toBe("My company name");
        expect(merged.location).toBe("Remote in Canada");
        expect(merged.payCurrency).toBe("USD");
        expect(merged.role).toBe("Engineer");
        expect(merged.notes).toBe("Keep this note");
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
        );

        expect(merged.company).toBe("");
        expect(merged.role).toBe("");
        expect(merged.location).toBe("");
        expect(merged.arrangement).toBeNull();
        expect(merged.payMin).toBe("");
        expect(merged.payMax).toBe("");
    });
});
