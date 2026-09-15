import { describe, expect, test } from "bun:test";
import { placesFrom } from "@/lib/application-places";

describe("placesFrom", () => {
    test("merges the spellings that name the same city", () => {
        const places = placesFrom([
            "Toronto, ON",
            "toronto, ontario",
            "Toronto, Canada",
        ]);

        expect(places).toHaveLength(1);
        expect(places[0].label).toBe("Toronto, Ontario, Canada");
        expect(places[0].city).toBe("Toronto");
        expect(places[0].count).toBe(3);
    });

    test("leaves out text that names no city", () => {
        expect(
            placesFrom(["Remote", "Anywhere", "TBD", "", "   ", null]),
        ).toEqual([]);
    });

    test("still places a city that carries a work arrangement", () => {
        const places = placesFrom(["Remote - San Francisco, CA"]);

        expect(places.map((place) => place.city)).toEqual(["San Francisco"]);
    });

    test("orders the busiest city first", () => {
        const places = placesFrom([
            "Seattle, WA",
            "Toronto, ON",
            "Toronto, ON",
            "Toronto, ON",
            "Berlin, DE",
            "Berlin, DE",
        ]);

        expect(places.map((place) => [place.city, place.count])).toEqual([
            ["Toronto", 3],
            ["Berlin", 2],
            ["Seattle", 1],
        ]);
    });

    test("carries a point for every city it returns", () => {
        const places = placesFrom(["Toronto, ON", "NYC", "Berlin, DE"]);

        expect(places).toHaveLength(3);
        for (const place of places) {
            expect(Number.isFinite(place.latitude)).toBe(true);
            expect(Number.isFinite(place.longitude)).toBe(true);
            expect(Math.abs(place.latitude)).toBeLessThanOrEqual(90);
            expect(Math.abs(place.longitude)).toBeLessThanOrEqual(180);
        }
    });

    test("names the region and country a city sits in", () => {
        const places = placesFrom(["Toronto, ON", "Austin, TX"]);

        expect(
            places.map((place) => [place.region, place.country]).sort(),
        ).toEqual([
            ["Ontario", "Canada"],
            ["Texas", "United States"],
        ]);
    });

    // The world index files Berlin's region as "State of Berlin", which reads
    // badly beside the plainer names the rest of the map uses.
    test("prefers the popular list's plainer region names", () => {
        const [berlin] = placesFrom(["Berlin, DE"]);

        expect(berlin.region).toBe("Berlin");
        expect(berlin.country).toBe("Germany");
    });
});
