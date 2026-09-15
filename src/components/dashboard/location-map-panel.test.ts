import { describe, expect, test } from "bun:test";
import {
    countNames,
    mergeNames,
    regionNameFrom,
    summaryFrom,
} from "@/components/dashboard/location-map-panel";
import type { Place } from "@/components/dashboard/data";

const place = (city: string, region: string, country: string): Place => ({
    label: `${city}, ${region}, ${country}`,
    city,
    region,
    country,
    latitude: 0,
    longitude: 0,
    count: 1,
});

describe("regionNameFrom", () => {
    test("names the region inside its country", () => {
        expect(regionNameFrom("Ontario", "Canada")).toBe("Ontario, Canada");
    });

    test("does not repeat a city state's name twice", () => {
        expect(regionNameFrom("Singapore", "Singapore")).toBe("Singapore");
    });

    test("falls back to the country when the region is unknown", () => {
        expect(regionNameFrom("", "Canada")).toBe("Canada");
    });

    test("has nothing to say when neither is known", () => {
        expect(regionNameFrom("", "")).toBe("");
    });
});

describe("summaryFrom", () => {
    test("names the country when every city shares one", () => {
        expect(
            summaryFrom([
                place("Toronto", "Ontario", "Canada"),
                place("Vancouver", "British Columbia", "Canada"),
            ]),
        ).toBe("2 cities in Canada");
    });

    test("counts the countries when the cities span several", () => {
        expect(
            summaryFrom([
                place("Toronto", "Ontario", "Canada"),
                place("Boston", "Massachusetts", "United States"),
                place("Berlin", "Berlin", "Germany"),
            ]),
        ).toBe("3 cities in 3 countries");
    });

    test("names a lone city's country rather than counting to one", () => {
        expect(summaryFrom([place("Toronto", "Ontario", "Canada")])).toBe(
            "Canada",
        );
    });

    test("says nothing when no application names a place", () => {
        expect(summaryFrom([])).toBe("");
    });
});

describe("mergeNames", () => {
    test("keeps one of each, in order", () => {
        expect(mergeNames("Canada", "Canada")).toBe("Canada");
        expect(countNames(mergeNames("Canada", "Canada"))).toBe(1);
    });

    test("holds names that contain a space apart", () => {
        const merged = mergeNames("United States", "United Kingdom");

        expect(countNames(merged)).toBe(2);
    });

    test("survives being merged over and over, as clustering does it", () => {
        const merged = ["Germany", "Canada", "Canada", "Japan"].reduce(
            mergeNames,
            "",
        );

        expect(countNames(merged)).toBe(3);
        expect(mergeNames(merged, merged)).toBe(merged);
    });

    test("counts nothing in an empty set", () => {
        expect(countNames("")).toBe(0);
    });
});
