import { describe, expect, test } from "bun:test";
import {
    comprehensiveCityCount,
    resolveComprehensiveLocation,
    searchComprehensiveLocations,
} from "@/lib/job-import/location-server";

describe("resolveComprehensiveLocation", () => {
    test("ships a broad worldwide city index", () => {
        expect(comprehensiveCityCount()).toBeGreaterThan(65_000);
    });

    test("matches non-popular cities with region context in any order", () => {
        const expected = {
            status: "matched",
            location: "Guelph, Ontario, Canada",
        } as const;

        expect(resolveComprehensiveLocation("Guelph, ON")).toEqual(expected);
        expect(resolveComprehensiveLocation("ON, Guelph")).toEqual(expected);
        expect(resolveComprehensiveLocation("Canada Guelph Ontario")).toEqual(
            expected,
        );
    });

    test("uses exact country context to settle an otherwise ambiguous city", () => {
        expect(resolveComprehensiveLocation("Canada, London")).toEqual({
            status: "matched",
            location: "London, Ontario, Canada",
        });
        expect(resolveComprehensiveLocation("London UK")).toEqual({
            status: "matched",
            location: "London, England, United Kingdom",
        });
    });

    test("offers ranked choices for ambiguous exact and misspelled cities", () => {
        const londonSuggestions = [
            "London, England, United Kingdom",
            "London, Ontario, Canada",
        ];

        for (const input of ["London", "Londn"]) {
            const result = resolveComprehensiveLocation(input);
            expect(result.status).toBe("suggestions");
            if (result.status === "suggestions") {
                expect(result.suggestions).toEqual(londonSuggestions);
            }
        }

        const springfield = resolveComprehensiveLocation("Springfield");
        expect(springfield.status).toBe("suggestions");
        if (springfield.status === "suggestions") {
            expect(springfield.suggestions).toContain(
                "Springfield, Massachusetts, United States",
            );
            expect(springfield.suggestions).toContain(
                "Springfield, Illinois, United States",
            );
        }
    });

    test("auto-corrects a dominant city and corroborated typo", () => {
        expect(resolveComprehensiveLocation("Tornto")).toEqual({
            status: "matched",
            location: "Toronto, Ontario, Canada",
        });
        expect(resolveComprehensiveLocation("Canada, Tornto")).toEqual({
            status: "matched",
            location: "Toronto, Ontario, Canada",
        });
    });

    test("does not force prose, regions, or metro areas into a city", () => {
        for (const input of [
            "Remote",
            "Europe",
            "San Francisco Bay Area",
            "London office",
        ]) {
            expect(resolveComprehensiveLocation(input)).toEqual({
                status: "unmatched",
            });
        }
    });
});

describe("searchComprehensiveLocations", () => {
    test("finds worldwide cities by indexed prefix", () => {
        expect(searchComprehensiveLocations("Gue")).toContain(
            "Guelph, Ontario, Canada",
        );
        expect(searchComprehensiveLocations("Canada Gue")[0]).toBe(
            "Guelph, Ontario, Canada",
        );
        const newYork = searchComprehensiveLocations("New");
        expect(newYork[0]).toBe("New York, New York, United States");
        expect(newYork).not.toContain("New York City, New York, United States");
    });

    test("keeps exact and typo ambiguity choices at the front", () => {
        const expected = [
            "London, England, United Kingdom",
            "London, Ontario, Canada",
        ];
        expect(searchComprehensiveLocations("London")).toEqual(expected);
        expect(searchComprehensiveLocations("Londn")).toEqual(expected);
    });

    test("ranks literal prefixes above shorter fuzzy corrections", () => {
        const results = searchComprehensiveLocations("cambrid");
        expect(results[0]).toStartWith("Cambridge,");
        expect(results).toContain("Cambridge, Ontario, Canada");
        expect(results).not.toContain("Cambria, California, United States");
    });

    test("does not search on one-character input", () => {
        expect(searchComprehensiveLocations("L")).toEqual([]);
    });
});
