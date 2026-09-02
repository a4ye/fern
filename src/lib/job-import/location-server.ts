// The complete city index is deliberately isolated from the client module
// graph. The create drawer asks this module through a server action only when
// its small popular-city index cannot settle a scraped location immediately.

import generated from "@/lib/job-import/city-data.generated.json";
import {
    canonicalLocation,
    countryAliasesFor,
    locationFingerprint,
    locationWords,
    regionAliasesFor,
    resolvePopularLocation,
    type ImportedLocationResolution,
    type LocationRecord,
} from "@/lib/job-import/location";

type CityRow = readonly [
    city: string,
    region: string,
    adminCode: string,
    country: string,
    countryCode: string,
    countryCode3: string,
    population: number,
];

type AliasRow = readonly [alias: string, cityIndexes: number[]];

type GeneratedCityData = {
    source: string;
    license: string;
    lastModified?: string;
    maxAliasLength: number;
    maxCityWords: number;
    rows: CityRow[];
    buckets: Record<string, AliasRow[]>;
};

type IndexedRecord = LocationRecord & {
    label: string;
};

type Span = {
    value: string;
    start: number;
    end: number;
};

type Candidate = {
    record: IndexedRecord;
    distance: number;
    cityWordCount: number;
    contextual: boolean;
};

const CITY_DATA = generated as unknown as GeneratedCityData;
const MAX_INPUT_WORDS = 12;
const MAX_SUGGESTIONS = 3;
const SIGNIFICANT_CITY_POPULATION = 50_000;
const DOMINANT_CITY_POPULATION = 100_000;
const rememberedRecords = new Map<number, IndexedRecord>();
const rememberedContexts = new WeakMap<IndexedRecord, Set<string>>();

const recordAt = (index: number): IndexedRecord | null => {
    const remembered = rememberedRecords.get(index);
    if (remembered) return remembered;
    const row = CITY_DATA.rows[index];
    if (!row) return null;

    const record: IndexedRecord = {
        city: row[0],
        region: row[1],
        adminCode: row[2],
        country: row[3],
        countryCode: row[4],
        countryCode3: row[5],
        population: row[6],
        label: "",
    };
    const canonical = canonicalLocation(record);
    const popular = resolvePopularLocation(canonical);
    record.label = popular.status === "matched" ? popular.location : canonical;
    if (!record.label || record.label.length > 120) return null;
    rememberedRecords.set(index, record);
    return record;
};

const spansOf = (words: readonly string[]): Span[] => {
    const spans: Span[] = [];
    for (let start = 0; start < words.length; start += 1) {
        const limit = Math.min(words.length, start + CITY_DATA.maxCityWords);
        for (let end = start + 1; end <= limit; end += 1) {
            spans.push({
                value: words.slice(start, end).join(" "),
                start,
                end,
            });
        }
    }
    return spans.sort(
        (left, right) =>
            right.end - right.start - (left.end - left.start) ||
            right.value.length - left.value.length,
    );
};

const bucketFor = (value: string): AliasRow[] =>
    CITY_DATA.buckets[`${value[0]}:${value.length}`] ?? [];

const exactAlias = (
    bucket: readonly AliasRow[],
    value: string,
): AliasRow | null => {
    let low = 0;
    let high = bucket.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const entry = bucket[middle];
        const comparison = entry[0].localeCompare(value, "en");
        if (comparison === 0) return entry;
        if (comparison < 0) low = middle + 1;
        else high = middle - 1;
    }
    return null;
};

const contextFingerprint = (words: readonly string[], span: Span): string =>
    [...words.slice(0, span.start), ...words.slice(span.end)].sort().join(" ");

const contextKeysFor = (record: IndexedRecord): Set<string> => {
    const remembered = rememberedContexts.get(record);
    if (remembered) return remembered;

    const regions = regionAliasesFor(
        record.countryCode,
        record.region,
        record.adminCode,
    );
    const countries = countryAliasesFor(
        record.country,
        record.countryCode,
        record.countryCode3,
    );
    const keys = new Set<string>([""]);
    for (const region of regions) keys.add(locationFingerprint(region));
    for (const country of countries) keys.add(locationFingerprint(country));
    for (const region of regions) {
        for (const country of countries) {
            keys.add(locationFingerprint(`${region} ${country}`));
        }
    }
    rememberedContexts.set(record, keys);
    return keys;
};

const candidateFor = (
    record: IndexedRecord,
    words: readonly string[],
    span: Span,
    distance: number,
): Candidate | null => {
    const context = contextFingerprint(words, span);
    if (!contextKeysFor(record).has(context)) return null;
    return {
        record,
        distance,
        cityWordCount: span.end - span.start,
        contextual: context.length > 0,
    };
};

// Optimal string alignment distance with a strict ceiling. Location matching
// never asks for more than two edits, so rows that cannot recover bail early.
const editDistance = (left: string, right: string, max: number): number => {
    if (Math.abs(left.length - right.length) > max) return max + 1;
    if (left === right) return 0;

    let beforePrevious: number[] = [];
    let previous = Array.from(
        { length: right.length + 1 },
        (_, index) => index,
    );
    for (let i = 1; i <= left.length; i += 1) {
        const current = [i];
        let best = i;
        for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            let distance = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            );
            if (
                i > 1 &&
                j > 1 &&
                left[i - 1] === right[j - 2] &&
                left[i - 2] === right[j - 1]
            ) {
                distance = Math.min(distance, beforePrevious[j - 2] + 1);
            }
            current[j] = distance;
            best = Math.min(best, distance);
        }
        if (best > max) return max + 1;
        beforePrevious = previous;
        previous = current;
    }
    return previous[right.length];
};

const typoAllowance = (value: string): number => {
    const length = value.replace(/\s/g, "").length;
    if (length < 5) return 0;
    return length < 9 ? 1 : 2;
};

const exactCandidates = (words: readonly string[]): Candidate[] => {
    const candidates: Candidate[] = [];
    for (const span of spansOf(words)) {
        const alias = exactAlias(bucketFor(span.value), span.value);
        if (!alias) continue;
        for (const index of alias[1]) {
            const record = recordAt(index);
            if (!record) continue;
            const candidate = candidateFor(record, words, span, 0);
            if (candidate) candidates.push(candidate);
        }
    }
    return candidates;
};

const fuzzyCandidates = (words: readonly string[]): Candidate[] => {
    const candidates: Candidate[] = [];
    for (const span of spansOf(words)) {
        const allowance = typoAllowance(span.value);
        if (allowance === 0) continue;

        for (
            let length = Math.max(1, span.value.length - allowance);
            length <= span.value.length + allowance;
            length += 1
        ) {
            const bucket = CITY_DATA.buckets[`${span.value[0]}:${length}`];
            for (const alias of bucket ?? []) {
                const distance = editDistance(span.value, alias[0], allowance);
                if (distance === 0 || distance > allowance) continue;
                for (const index of alias[1]) {
                    const record = recordAt(index);
                    if (!record) continue;
                    const candidate = candidateFor(
                        record,
                        words,
                        span,
                        distance,
                    );
                    if (candidate) candidates.push(candidate);
                }
            }
        }
    }
    return candidates;
};

const strongestCandidates = (candidates: Candidate[]): Candidate[] => {
    if (candidates.length === 0) return [];
    const bestDistance = Math.min(
        ...candidates.map((candidate) => candidate.distance),
    );
    const closest = candidates.filter(
        (candidate) => candidate.distance === bestDistance,
    );
    const contextual = closest.some((candidate) => candidate.contextual);
    const withContext = contextual
        ? closest.filter((candidate) => candidate.contextual)
        : closest;
    const longest = Math.max(
        ...withContext.map((candidate) => candidate.cityWordCount),
    );
    return withContext.filter(
        (candidate) => candidate.cityWordCount === longest,
    );
};

const uniqueCandidates = (candidates: Candidate[]): Candidate[] => {
    const byLocation = new Map<string, Candidate>();
    for (const candidate of candidates) {
        const previous = byLocation.get(candidate.record.label);
        if (
            !previous ||
            candidate.distance < previous.distance ||
            candidate.record.population > previous.record.population
        ) {
            byLocation.set(candidate.record.label, candidate);
        }
    }
    return [...byLocation.values()].sort(
        (left, right) =>
            left.distance - right.distance ||
            right.record.population - left.record.population ||
            left.record.label.localeCompare(right.record.label, "en"),
    );
};

const isDominant = (candidates: readonly Candidate[]): boolean => {
    const [first, second] = candidates;
    if (!first || first.record.population < DOMINANT_CITY_POPULATION) {
        return false;
    }
    if (!second) return true;
    return (
        second.record.population < SIGNIFICANT_CITY_POPULATION &&
        first.record.population >= second.record.population * 5
    );
};

const resolutionFor = (
    rawCandidates: Candidate[],
    fuzzy: boolean,
): ImportedLocationResolution => {
    const candidates = uniqueCandidates(strongestCandidates(rawCandidates));
    if (candidates.length === 0) return { status: "unmatched" };

    const contextual = candidates[0]?.contextual === true;
    if (
        candidates.length === 1 &&
        (!fuzzy || contextual || isDominant(candidates))
    ) {
        return { status: "matched", location: candidates[0].record.label };
    }
    if (!contextual && isDominant(candidates)) {
        return { status: "matched", location: candidates[0].record.label };
    }
    const significant = candidates.filter(
        (candidate) =>
            candidate.record.population >= SIGNIFICANT_CITY_POPULATION,
    );
    const suggestions = significant.length >= 2 ? significant : candidates;
    return {
        status: "suggestions",
        suggestions: suggestions
            .slice(0, MAX_SUGGESTIONS)
            .map((candidate) => candidate.record.label),
    };
};

export const resolveComprehensiveLocation = (
    raw: string,
): ImportedLocationResolution => {
    const words = locationWords(raw);
    if (words.length === 0 || words.length > MAX_INPUT_WORDS) {
        return { status: "unmatched" };
    }

    const exact = exactCandidates(words);
    if (exact.length > 0) return resolutionFor(exact, false);
    return resolutionFor(fuzzyCandidates(words), true);
};

const prefixStart = (bucket: readonly AliasRow[], prefix: string): number => {
    let low = 0;
    let high = bucket.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (bucket[middle][0].localeCompare(prefix, "en") < 0) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
};

const contextMatchesPrefixes = (
    record: IndexedRecord,
    words: readonly string[],
): boolean => {
    if (words.length === 0) return true;
    return [...contextKeysFor(record)].some((key) => {
        const candidates = key.split(" ").filter(Boolean);
        const used = new Set<number>();
        return words.every((word) => {
            const at = candidates.findIndex(
                (candidate, index) =>
                    !used.has(index) && candidate.startsWith(word),
            );
            if (at < 0) return false;
            used.add(at);
            return true;
        });
    });
};

type PrefixCandidate = {
    record: IndexedRecord;
    exact: boolean;
    prefixLength: number;
    cityWordCount: number;
    contextual: boolean;
};

const comparePrefixStrength = (
    left: PrefixCandidate,
    right: PrefixCandidate,
): number =>
    Number(right.contextual) - Number(left.contextual) ||
    Number(right.exact) - Number(left.exact) ||
    right.cityWordCount - left.cityWordCount ||
    right.prefixLength - left.prefixLength ||
    right.record.population - left.record.population ||
    left.record.label.localeCompare(right.record.label, "en");

const prefixCandidates = (words: readonly string[]): PrefixCandidate[] => {
    const byLocation = new Map<string, PrefixCandidate>();
    for (const span of spansOf(words)) {
        if (span.value.length < 2) continue;
        const context = [
            ...words.slice(0, span.start),
            ...words.slice(span.end),
        ];
        for (
            let length = span.value.length;
            length <= CITY_DATA.maxAliasLength;
            length += 1
        ) {
            const bucket = CITY_DATA.buckets[`${span.value[0]}:${length}`];
            if (!bucket) continue;
            for (
                let at = prefixStart(bucket, span.value);
                at < bucket.length && bucket[at][0].startsWith(span.value);
                at += 1
            ) {
                for (const index of bucket[at][1]) {
                    const record = recordAt(index);
                    if (!record || !contextMatchesPrefixes(record, context)) {
                        continue;
                    }
                    const candidate: PrefixCandidate = {
                        record,
                        exact: bucket[at][0] === span.value,
                        prefixLength: span.value.length,
                        cityWordCount: span.end - span.start,
                        contextual: context.length > 0,
                    };
                    const previous = byLocation.get(record.label);
                    if (
                        !previous ||
                        comparePrefixStrength(candidate, previous) < 0
                    ) {
                        byLocation.set(record.label, candidate);
                    }
                }
            }
        }
    }
    return [...byLocation.values()].sort(comparePrefixStrength);
};

// Search is separate from resolution: a partial value can legitimately be an
// exact name of a tiny place and still be the beginning of a larger city. Exact
// and typo resolutions lead, then the indexed prefix results fill the list.
export const searchComprehensiveLocations = (
    raw: string,
    limit = 8,
): string[] => {
    const words = locationWords(raw);
    if (
        words.length === 0 ||
        words.length > MAX_INPUT_WORDS ||
        words.join(" ").length < 2 ||
        limit < 1
    ) {
        return [];
    }

    const prefixes = prefixCandidates(words);
    if (prefixes.length > 0) {
        const significant = prefixes.filter(
            (candidate) =>
                candidate.record.population >= SIGNIFICANT_CITY_POPULATION,
        );
        const exactSignificant = significant.filter(
            (candidate) => candidate.exact,
        );
        const ranked =
            exactSignificant.length >= 2
                ? exactSignificant
                : significant.length >= 2
                  ? significant
                  : prefixes;
        return ranked
            .slice(0, limit)
            .map((candidate) => candidate.record.label);
    }

    const resolution = resolveComprehensiveLocation(raw);
    return resolution.status === "matched"
        ? [resolution.location]
        : resolution.status === "suggestions"
          ? resolution.suggestions.slice(0, limit)
          : [];
};

export const comprehensiveCityCount = (): number => CITY_DATA.rows.length;
