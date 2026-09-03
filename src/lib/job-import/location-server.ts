// The complete city index is deliberately isolated from the client module
// graph. The create drawer asks this module through a server action only when
// its small popular-city index cannot settle a scraped location immediately.

import generated from "@/lib/job-import/city-data.generated.json";
import {
    canonicalLocation,
    countryAliasesFor,
    locationFingerprint,
    locationWords,
    normalizeLocationPhrase,
    popularLocationPriority,
    regionAliasesFor,
    resolvePopularLocation,
    searchPopularLocations,
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
    entities: string[];
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
    match: "exact" | "prefix" | "fuzzy";
    distance: number;
    cityWordCount: number;
    contextQuality: number;
    matchScore: number;
};

const CITY_DATA = generated as unknown as GeneratedCityData;
const MAX_INPUT_WORDS = 12;
const MAX_SUGGESTIONS = 3;
const SIGNIFICANT_CITY_POPULATION = 50_000;
const DOMINANT_CITY_POPULATION = 100_000;
const ENTITY_NAME_CITY_POPULATION = 500_000;
const rememberedRecords = new Map<number, IndexedRecord>();
const rememberedContexts = new WeakMap<IndexedRecord, Set<string>>();
const STANDALONE_ENTITIES = new Set([
    ...CITY_DATA.entities,
    "africa",
    "asia",
    "europe",
    "global",
    "middle east",
    "north america",
    "south america",
    "worldwide",
]);

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

const contextQualityFor = (
    record: IndexedRecord,
    words: readonly string[],
    span: Span,
): number => {
    const context = contextFingerprint(words, span);
    if (!context) return 0;
    if (contextKeysFor(record).has(context)) return 2;

    const queryWords = context.split(" ");
    if (queryWords.some((word) => word.length < 3)) return -1;
    const prefixMatch = [...contextKeysFor(record)].some((key) => {
        const candidates = key.split(" ").filter(Boolean);
        const used = new Set<number>();
        return queryWords.every((word) => {
            const at = candidates.findIndex(
                (candidate, index) =>
                    !used.has(index) && candidate.startsWith(word),
            );
            if (at < 0) return false;
            used.add(at);
            return true;
        });
    });
    return prefixMatch ? 1 : -1;
};

const candidateFor = (
    record: IndexedRecord,
    words: readonly string[],
    span: Span,
    match: Candidate["match"],
    distance: number,
    aliasLength: number,
): Candidate | null => {
    const contextQuality = contextQualityFor(record, words, span);
    if (contextQuality < 0) return null;
    const similarity =
        1 - distance / Math.max(span.value.length, aliasLength, 1);
    const coverage = span.value.length / Math.max(aliasLength, 1);
    return {
        record,
        match,
        distance,
        cityWordCount: span.end - span.start,
        contextQuality,
        matchScore:
            match === "exact"
                ? 100
                : match === "prefix"
                  ? 80 + 20 * coverage
                  : 70 + 25 * similarity,
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
            const candidate = candidateFor(
                record,
                words,
                span,
                "exact",
                0,
                alias[0].length,
            );
            if (candidate) candidates.push(candidate);
        }
    }
    return candidates;
};

let rememberedInitialsByLength: Map<number, string[]> | null = null;

const initialsForLength = (length: number): readonly string[] => {
    if (!rememberedInitialsByLength) {
        rememberedInitialsByLength = new Map<number, string[]>();
        for (const key of Object.keys(CITY_DATA.buckets)) {
            const colon = key.lastIndexOf(":");
            const bucketLength = Number(key.slice(colon + 1));
            const initial = key.slice(0, colon);
            const initials = rememberedInitialsByLength.get(bucketLength) ?? [];
            initials.push(initial);
            rememberedInitialsByLength.set(bucketLength, initials);
        }
    }
    return rememberedInitialsByLength.get(length) ?? [];
};

// The regular typo scan stays in the same first-character bucket. These exact
// probes cover a wrong, missing, extra, or transposed first character without
// scanning every alias of the same length.
const initialTypoAliases = (value: string, allowance: number): AliasRow[] => {
    const aliases = new Map<string, AliasRow>();
    const remember = (candidate: string) => {
        if (!candidate) return;
        const alias = exactAlias(bucketFor(candidate), candidate);
        if (alias) aliases.set(alias[0], alias);
    };

    if (value.length > 1) {
        remember(`${value[1]}${value[0]}${value.slice(2)}`);
        remember(value.slice(1));
    }
    for (const initial of initialsForLength(value.length)) {
        remember(`${initial}${value.slice(1)}`);
    }
    if (allowance > 0) {
        for (const initial of initialsForLength(value.length + 1)) {
            remember(`${initial}${value}`);
        }
    }
    return [...aliases.values()];
};

const fuzzyCandidates = (words: readonly string[]): Candidate[] => {
    const candidates: Candidate[] = [];
    for (const span of spansOf(words)) {
        const allowance = typoAllowance(span.value);
        if (allowance === 0) continue;

        const aliases = new Map<string, AliasRow>();

        for (
            let length = Math.max(1, span.value.length - allowance);
            length <= span.value.length + allowance;
            length += 1
        ) {
            const bucket = CITY_DATA.buckets[`${span.value[0]}:${length}`];
            for (const alias of bucket ?? []) {
                aliases.set(alias[0], alias);
            }
        }
        for (const alias of initialTypoAliases(span.value, allowance)) {
            aliases.set(alias[0], alias);
        }

        for (const alias of aliases.values()) {
            const distance = editDistance(span.value, alias[0], allowance);
            if (distance === 0 || distance > allowance) continue;
            for (const index of alias[1]) {
                const record = recordAt(index);
                if (!record) continue;
                const candidate = candidateFor(
                    record,
                    words,
                    span,
                    "fuzzy",
                    distance,
                    alias[0].length,
                );
                if (candidate) candidates.push(candidate);
            }
        }
    }
    return candidates;
};

const isPopular = (candidate: Candidate): boolean =>
    popularLocationPriority(candidate.record.label) < Number.MAX_SAFE_INTEGER;

const compareCandidates = (left: Candidate, right: Candidate): number => {
    const leftExact = left.match === "exact";
    const rightExact = right.match === "exact";
    const exactWordDifference =
        leftExact && rightExact ? right.cityWordCount - left.cityWordCount : 0;
    const leftPopular = isPopular(left);
    const rightPopular = isPopular(right);
    const popularityDifference =
        leftPopular && rightPopular
            ? popularLocationPriority(left.record.label) -
              popularLocationPriority(right.record.label)
            : 0;
    return (
        Number(rightExact) - Number(leftExact) ||
        exactWordDifference ||
        right.contextQuality - left.contextQuality ||
        Number(rightPopular) - Number(leftPopular) ||
        popularityDifference ||
        right.matchScore - left.matchScore ||
        right.cityWordCount - left.cityWordCount ||
        left.distance - right.distance ||
        right.record.population - left.record.population ||
        left.record.label.localeCompare(right.record.label, "en")
    );
};

const uniqueCandidates = (candidates: Candidate[]): Candidate[] => {
    const byLocation = new Map<string, Candidate>();
    for (const candidate of candidates) {
        const previous = byLocation.get(candidate.record.label);
        if (!previous || compareCandidates(candidate, previous) < 0) {
            byLocation.set(candidate.record.label, candidate);
        }
    }
    return [...byLocation.values()].sort(compareCandidates);
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

const matched = (candidate: Candidate): ImportedLocationResolution => ({
    status: "matched",
    location: candidate.record.label,
    countryCode: candidate.record.countryCode,
});

const resolutionFor = (
    rawCandidates: Candidate[],
    exact: boolean,
): ImportedLocationResolution => {
    const ranked = uniqueCandidates(rawCandidates);
    const bestContext = ranked[0]?.contextQuality;
    const candidates = ranked.filter(
        (candidate) => candidate.contextQuality === bestContext,
    );
    if (candidates.length === 0) return { status: "unmatched" };

    if (exact && (candidates.length === 1 || isDominant(candidates))) {
        return matched(candidates[0]);
    }
    if (!exact && candidates[0].match === "fuzzy") {
        const hasPrefixCompetitor = candidates.some(
            (candidate) => candidate.match === "prefix",
        );
        if (
            candidates[0].contextQuality === 2 ||
            (!hasPrefixCompetitor && isDominant(candidates))
        ) {
            return matched(candidates[0]);
        }
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
    const popular = resolvePopularLocation(raw);
    if (popular.status !== "unmatched") return popular;

    const words = locationWords(raw);
    if (words.length === 0 || words.length > MAX_INPUT_WORDS) {
        return { status: "unmatched" };
    }
    const standaloneEntity = STANDALONE_ENTITIES.has(
        normalizeLocationPhrase(words.join(" ")),
    );
    if (words.join(" ").length < 4) return { status: "unmatched" };

    const exact = exactCandidates(words);
    if (standaloneEntity) {
        const citySuggestions = uniqueCandidates(exact).filter(
            (candidate) =>
                candidate.record.population >= ENTITY_NAME_CITY_POPULATION,
        );
        return citySuggestions.length > 0
            ? {
                  status: "suggestions",
                  suggestions: citySuggestions
                      .slice(0, MAX_SUGGESTIONS)
                      .map((candidate) => candidate.record.label),
              }
            : { status: "unmatched" };
    }
    if (exact.length > 0) return resolutionFor(exact, true);
    return resolutionFor(
        [...prefixCandidates(words), ...fuzzyCandidates(words)],
        false,
    );
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

const prefixCandidates = (words: readonly string[]): Candidate[] => {
    const byLocation = new Map<string, Candidate>();
    for (const span of spansOf(words)) {
        if (span.value.length < 2) continue;
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
                    if (!record) continue;
                    const candidate = candidateFor(
                        record,
                        words,
                        span,
                        bucket[at][0] === span.value ? "exact" : "prefix",
                        0,
                        bucket[at][0].length,
                    );
                    if (!candidate) continue;
                    const previous = byLocation.get(record.label);
                    if (
                        !previous ||
                        compareCandidates(candidate, previous) < 0
                    ) {
                        byLocation.set(record.label, candidate);
                    }
                }
            }
        }
    }
    return [...byLocation.values()].sort(compareCandidates);
};

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

    const popularResolution = resolvePopularLocation(raw);
    const exactMatches = exactCandidates(words);
    if (
        popularResolution.status === "unmatched" &&
        STANDALONE_ENTITIES.has(normalizeLocationPhrase(words.join(" ")))
    ) {
        return uniqueCandidates(exactMatches)
            .slice(0, limit)
            .map((candidate) => candidate.record.label);
    }
    const ranked = uniqueCandidates([
        ...exactMatches,
        ...prefixCandidates(words),
        ...(exactMatches.length === 0 &&
        popularResolution.status === "unmatched"
            ? fuzzyCandidates(words)
            : []),
    ]);
    const bestContext = ranked[0]?.contextQuality;
    const contextual = ranked.filter(
        (candidate) => candidate.contextQuality === bestContext,
    );
    const exact = contextual.filter((candidate) => candidate.match === "exact");
    let globalCandidates: Candidate[];
    if (exact.length > 0) {
        const significantExact = exact.filter(
            (candidate) =>
                candidate.record.population >= SIGNIFICANT_CITY_POPULATION,
        );
        const leadingExact =
            significantExact.length >= 2 ? significantExact : exact;
        globalCandidates =
            leadingExact.length >= 2
                ? leadingExact
                : [
                      ...leadingExact,
                      ...contextual.filter(
                          (candidate) => candidate.match !== "exact",
                      ),
                  ];
    } else {
        const significant = contextual.filter(
            (candidate) =>
                candidate.record.population >= SIGNIFICANT_CITY_POPULATION,
        );
        globalCandidates = significant.length >= 2 ? significant : contextual;
    }

    const popular = searchPopularLocations(raw, limit);
    const globalSource =
        popularResolution.status === "matched" && exact.length === 0
            ? []
            : popularResolution.status === "matched"
              ? exact
              : globalCandidates;
    const global = globalSource.map((candidate) => candidate.record.label);
    const popularFirst =
        popularResolution.status !== "unmatched" ||
        (words.join(" ").length <= 3 && exact.length > 0);
    const ordered = popularFirst
        ? [...popular, ...global]
        : [...global, ...popular];
    const seen = new Set<string>();
    return ordered
        .filter((location) => {
            const key = normalizeLocationPhrase(location);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
};

export const comprehensiveCityCount = (): number => CITY_DATA.rows.length;
