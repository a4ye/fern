import { describe, expect, test } from "bun:test";
import {
    locationFingerprint,
    resolvePopularLocation,
    searchPopularLocations,
} from "@/lib/job-import/location";

describe("resolvePopularLocation", () => {
    test("matches city, region, and country in any order", () => {
        const expected = {
            status: "matched",
            location: "Toronto, Ontario, Canada",
        } as const;

        expect(resolvePopularLocation("Toronto, Canada")).toEqual(expected);
        expect(resolvePopularLocation("Canada, Toronto")).toEqual(expected);
        expect(resolvePopularLocation("Toronto, ON")).toEqual(expected);
        expect(resolvePopularLocation("ON Toronto Canada")).toEqual(expected);
    });

    test("expands deliberate technology-city aliases", () => {
        expect(resolvePopularLocation("NYC")).toEqual({
            status: "matched",
            location: "New York, New York, United States",
        });
        expect(resolvePopularLocation("SF")).toEqual({
            status: "matched",
            location: "San Francisco, California, United States",
        });
        expect(resolvePopularLocation("München, Germany")).toEqual({
            status: "matched",
            location: "Munich, Bavaria, Germany",
        });
    });

    test("does not settle known ambiguous bare names and abbreviations", () => {
        expect(resolvePopularLocation("London")).toEqual({
            status: "unmatched",
        });
        expect(resolvePopularLocation("LA")).toEqual({ status: "unmatched" });
        expect(resolvePopularLocation("San Jose")).toEqual({
            status: "unmatched",
        });
    });

    test("ignores arrangement wording without changing metro areas", () => {
        expect(resolvePopularLocation("Remote (Toronto, ON)")).toEqual({
            status: "matched",
            location: "Toronto, Ontario, Canada",
        });
        expect(resolvePopularLocation("San Francisco Bay Area")).toEqual({
            status: "unmatched",
        });
    });
});

describe("searchPopularLocations", () => {
    test("offers the curated technology hubs before typing", () => {
        expect(searchPopularLocations("", 3)).toEqual([
            "Toronto, Ontario, Canada",
            "New York, New York, United States",
            "San Francisco, California, United States",
        ]);
    });

    test("suggests common cities from aliases and partial names", () => {
        expect(searchPopularLocations("SF")).toEqual([
            "San Francisco, California, United States",
        ]);
        expect(searchPopularLocations("new y")[0]).toBe(
            "New York, New York, United States",
        );
        expect(searchPopularLocations("Canada, Tor")[0]).toBe(
            "Toronto, Ontario, Canada",
        );
    });

    test("does not turn a country-only query into an arbitrary city list", () => {
        expect(searchPopularLocations("Canada")).toEqual([]);
        expect(searchPopularLocations("United States")).toEqual([]);
    });
});

describe("locationFingerprint", () => {
    test("folds punctuation, accents, initials, and component order", () => {
        expect(locationFingerprint("U.S., Montréal")).toBe(
            locationFingerprint("Montreal US"),
        );
    });
});
