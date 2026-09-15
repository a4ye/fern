import { describe, expect, test } from "bun:test";
import {
    canonicalLocation,
    POPULAR_LOCATIONS,
} from "@/lib/job-import/location";
import {
    comprehensiveCityCount,
    placeForLocation,
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
            countryCode: "CA",
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
            countryCode: "CA",
        });
        expect(resolveComprehensiveLocation("London UK")).toEqual({
            status: "matched",
            location: "London, England, United Kingdom",
            countryCode: "GB",
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
            countryCode: "CA",
        });
        expect(resolveComprehensiveLocation("Canada, Tornto")).toEqual({
            status: "matched",
            location: "Toronto, Ontario, Canada",
            countryCode: "CA",
        });
        for (const input of [
            "otronto",
            "xoronto",
            "oronto",
            "ttoronto",
            "esattle",
        ]) {
            expect(resolveComprehensiveLocation(input).status).toBe("matched");
        }
    });

    test("does not reinterpret standalone countries, regions, or short fragments", () => {
        for (const input of [
            "Canada",
            "Ontario",
            "California",
            "Texas",
            "Quebec",
            "Wales",
            "San",
        ]) {
            expect(resolveComprehensiveLocation(input).status).not.toBe(
                "matched",
            );
        }
        expect(searchComprehensiveLocations("Ontario")[0]).toBe(
            "Ontario, California, United States",
        );
    });

    test("still offers major cities that share a country or region name", () => {
        expect(resolveComprehensiveLocation("Abu Dhabi")).toEqual({
            status: "suggestions",
            suggestions: ["Abu Dhabi, Abu Dhabi, United Arab Emirates"],
        });
        expect(searchComprehensiveLocations("Addis Ababa")[0]).toBe(
            "Addis Ababa, Addis Ababa, Ethiopia",
        );
    });

    test("uses exact short region codes instead of arbitrary prefixes", () => {
        expect(resolveComprehensiveLocation("Cambridge MA")).toEqual({
            status: "matched",
            location: "Cambridge, Massachusetts, United States",
            countryCode: "US",
        });
        expect(resolveComprehensiveLocation("San Jose CA")).toEqual({
            status: "matched",
            location: "San Jose, California, United States",
            countryCode: "US",
        });
        expect(resolveComprehensiveLocation("Guadalajara JAL")).toEqual({
            status: "matched",
            location: "Guadalajara, Jalisco, Mexico",
            countryCode: "MX",
        });
        expect(resolveComprehensiveLocation("Monterrey NL")).toEqual({
            status: "matched",
            location: "Monterrey, Nuevo Leon, Mexico",
            countryCode: "MX",
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
        expect(results.slice(0, 3)).toEqual([
            "Cambridge, Massachusetts, United States",
            "Cambridge, England, United Kingdom",
            "Cambridge, Ontario, Canada",
        ]);
        expect(results).not.toContain("Cambria, California, United States");
    });

    test("keeps exact small cities ahead of larger prefix matches", () => {
        expect(searchComprehensiveLocations("Lengshui")[0]).toBe(
            "Lengshui, Chongqing, China",
        );
        expect(searchComprehensiveLocations("Mikhaylov")[0]).toBe(
            "Mikhaylov, Ryazan Oblast, Russia",
        );
        expect(searchComprehensiveLocations("Belmont North")[0]).toBe(
            "Belmont North, New South Wales, Australia",
        );
        expect(
            searchComprehensiveLocations("Ar Rām wa Ḑāḩiyat al Barīd")[0],
        ).toBe("Ar Rām wa Ḑāḩiyat al Barīd, West Bank, Palestinian Territory");
    });

    test("ranks curated typo matches together with literal prefixes", () => {
        expect(searchComprehensiveLocations("parsi")[0]).toBe(
            "Paris, Île-de-France, France",
        );
        expect(resolveComprehensiveLocation("parsi")).toEqual({
            status: "suggestions",
            suggestions: [
                "Paris, Île-de-France, France",
                "Parsippany, New Jersey, United States",
            ],
        });
    });

    test("does not let short context fragments match region-name prefixes", () => {
        expect(searchComprehensiveLocations("Cambridge MA")).not.toContain(
            "Cambridge, Maryland, United States",
        );
        expect(searchComprehensiveLocations("San Jose CA")).not.toContain(
            "San José del Cabo, Baja California Sur, Mexico",
        );
        expect(searchComprehensiveLocations("St Louis")[0]).toBe(
            "St. Louis, Missouri, United States",
        );
    });

    test("keeps dropdown order aligned with automatic resolution", () => {
        for (const input of [
            "cambrid",
            "parsi",
            "Londn",
            "otronto",
            "Cambridge MA",
            "Guadalajara JAL",
        ]) {
            const resolution = resolveComprehensiveLocation(input);
            const results = searchComprehensiveLocations(input);
            if (resolution.status === "matched") {
                expect(results[0]).toBe(resolution.location);
            } else if (resolution.status === "suggestions") {
                expect(results.slice(0, resolution.suggestions.length)).toEqual(
                    resolution.suggestions,
                );
            }
        }
    });

    test("does not search on one-character input", () => {
        expect(searchComprehensiveLocations("L")).toEqual([]);
    });
});

describe("placeForLocation", () => {
    test("places matched cities within a degree of their real point", () => {
        const cases = [
            ["Toronto, ON", 43.65, -79.38],
            ["San Francisco, CA", 37.77, -122.42],
            // The popular list and the world index disagree on how to name
            // these two, so they only resolve through the generated pairing.
            ["NYC", 40.71, -74.01],
            ["Berlin, DE", 52.52, 13.41],
        ] as const;

        for (const [raw, latitude, longitude] of cases) {
            const resolution = resolveComprehensiveLocation(raw);
            expect(resolution.status).toBe("matched");
            if (resolution.status !== "matched") continue;

            const point = placeForLocation(resolution.location);
            expect(point).not.toBeNull();
            expect(point?.latitude).toBeCloseTo(latitude, 0);
            expect(point?.longitude).toBeCloseTo(longitude, 0);
        }
    });

    test("gives every popular location a point", () => {
        const missing = POPULAR_LOCATIONS.map(canonicalLocation).filter(
            (label) => placeForLocation(label) === null,
        );

        expect(missing).toEqual([]);
    });

    test("has no point for a name that is not a place", () => {
        expect(placeForLocation("Remote")).toBeNull();
        expect(placeForLocation("")).toBeNull();
    });
});
