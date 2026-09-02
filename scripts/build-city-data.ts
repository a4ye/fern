import { unzipSync } from "fflate";

const SOURCE_ROOT = "https://download.geonames.org/export/dump";
const CITY_ARCHIVE = "cities5000.zip";
const CITY_FILE = "cities5000.txt";
const OUTPUT = new URL(
    "../src/lib/job-import/city-data.generated.json",
    import.meta.url,
);

type Country = {
    name: string;
    iso3: string;
};

type SourceCityRow = readonly [
    city: string,
    asciiCity: string,
    region: string,
    adminCode: string,
    country: string,
    countryCode: string,
    countryCode3: string,
    population: number,
];

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

const normalizeAlias = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase("en")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");

const textFrom = async (name: string): Promise<string> => {
    const response = await fetch(`${SOURCE_ROOT}/${name}`);
    if (!response.ok) {
        throw new Error(`GeoNames ${name} returned ${response.status}.`);
    }
    return response.text();
};

const countriesFrom = (text: string): Map<string, Country> => {
    const countries = new Map<string, Country>();
    for (const line of text.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const fields = line.split("\t");
        const code = fields[0]?.trim();
        const iso3 = fields[1]?.trim();
        const name = fields[4]?.trim();
        if (code && iso3 && name) countries.set(code, { name, iso3 });
    }
    return countries;
};

const regionsFrom = (text: string): Map<string, string> => {
    const regions = new Map<string, string>();
    for (const line of text.split("\n")) {
        if (!line) continue;
        const [code, name, asciiName] = line.split("\t");
        const display = asciiName?.trim() || name?.trim();
        if (code && display) regions.set(code, display);
    }
    return regions;
};

const archiveResponse = await fetch(`${SOURCE_ROOT}/${CITY_ARCHIVE}`);
if (!archiveResponse.ok) {
    throw new Error(
        `GeoNames ${CITY_ARCHIVE} returned ${archiveResponse.status}.`,
    );
}

const [countryText, regionText, archive] = await Promise.all([
    textFrom("countryInfo.txt"),
    textFrom("admin1CodesASCII.txt"),
    archiveResponse.arrayBuffer(),
]);
const countries = countriesFrom(countryText);
const regions = regionsFrom(regionText);
const files = unzipSync(new Uint8Array(archive));
const cityBytes = files[CITY_FILE];
if (!cityBytes) throw new Error(`${CITY_FILE} was missing from the archive.`);

const decoded = new TextDecoder().decode(cityBytes);
const deduplicated = new Map<string, SourceCityRow>();
for (const line of decoded.split("\n")) {
    if (!line) continue;
    const fields = line.split("\t");
    const city = fields[1]?.trim();
    const asciiCity = fields[2]?.trim();
    const countryCode = fields[8]?.trim();
    const adminCode = fields[10]?.trim() ?? "";
    const population = Number(fields[14] ?? 0);
    const country = countryCode ? countries.get(countryCode) : undefined;
    if (!city || !country || !Number.isFinite(population)) continue;

    const region = regions.get(`${countryCode}.${adminCode}`) ?? "";
    const row: SourceCityRow = [
        city,
        asciiCity === city ? "" : asciiCity,
        region,
        adminCode,
        country.name,
        countryCode,
        country.iso3,
        population,
    ];
    const key = `${city}\u0000${region}\u0000${country.name}`;
    const previous = deduplicated.get(key);
    if (!previous || previous[7] < population) deduplicated.set(key, row);
}

const sourceRows = [...deduplicated.values()].sort(
    (left, right) =>
        left[0].localeCompare(right[0], "en") ||
        left[4].localeCompare(right[4], "en") ||
        left[2].localeCompare(right[2], "en"),
);
const rows: CityRow[] = sourceRows.map((row) => [
    row[0],
    row[2],
    row[3],
    row[4],
    row[5],
    row[6],
    row[7],
]);

// Standalone country and region names are not cities. Shipping this compact
// set with the generated index lets runtime matching reject inputs such as
// "Ontario" or "Canada" without walking every city row on the first request.
const entities = [
    ...new Set(
        [
            ...[...countries.entries()].flatMap(([code, country]) => [
                code,
                country.iso3,
                country.name,
            ]),
            ...regions.values(),
        ]
            .map(normalizeAlias)
            .filter(Boolean),
    ),
].sort((left, right) => left.localeCompare(right, "en"));

// The runtime can now jump straight to names with the same first character and
// length instead of building maps for the whole world on its first request.
// Entries inside a bucket are sorted, so exact aliases use binary search while
// typo matching scans only the neighboring one- or two-character buckets.
const bucketMaps = new Map<string, Map<string, number[]>>();
let maxCityWords = 1;
let maxAliasLength = 1;
sourceRows.forEach((row, cityIndex) => {
    const aliases = new Set(
        [row[0], row[1]].map(normalizeAlias).filter(Boolean),
    );
    for (const alias of aliases) {
        maxAliasLength = Math.max(maxAliasLength, alias.length);
        maxCityWords = Math.max(
            maxCityWords,
            Math.min(alias.split(" ").length, 12),
        );
        const bucketKey = `${alias[0]}:${alias.length}`;
        const bucket = bucketMaps.get(bucketKey) ?? new Map<string, number[]>();
        const indexes = bucket.get(alias) ?? [];
        indexes.push(cityIndex);
        bucket.set(alias, indexes);
        bucketMaps.set(bucketKey, bucket);
    }
});
const buckets = Object.fromEntries(
    [...bucketMaps.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(
            ([key, aliases]) =>
                [
                    key,
                    [...aliases.entries()]
                        .sort(([left], [right]) =>
                            left.localeCompare(right, "en"),
                        )
                        .map(([alias, indexes]) => [
                            alias,
                            indexes,
                        ]) as AliasRow[],
                ] as const,
        ),
);
const lastModified = archiveResponse.headers.get("last-modified");
const output = {
    source: `${SOURCE_ROOT}/${CITY_ARCHIVE}`,
    license: "GeoNames, CC BY 4.0",
    ...(lastModified ? { lastModified } : {}),
    maxAliasLength,
    maxCityWords,
    entities,
    rows,
    buckets,
};

await Bun.write(OUTPUT, `${JSON.stringify(output)}\n`);
process.stdout.write(
    `Wrote ${rows.length.toLocaleString()} GeoNames cities to ${OUTPUT.pathname}\n`,
);
