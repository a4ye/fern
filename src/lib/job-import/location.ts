// Fast, client-safe matching for the locations job postings use most often.
// The worldwide index stays server-only; importing it into the create drawer
// would make every visitor download several megabytes before entering a link.

export type ImportedLocationResolution =
    // The country is carried alongside the place so that what a posting pays in
    // can be guessed from where it is, which the label alone cannot answer:
    // "CA" is California to a reader and Canada to a lookup table.
    | { status: "matched"; location: string; countryCode: string | null }
    | { status: "suggestions"; suggestions: string[] }
    | { status: "unmatched" };

export type LocationRecord = {
    city: string;
    region: string;
    country: string;
    countryCode: string;
    countryCode3: string;
    adminCode: string;
    population: number;
    cityAliases?: readonly string[];
    regionAliases?: readonly string[];
    countryAliases?: readonly string[];
    // Only these city spellings may resolve without a country or region. Short
    // or geographically ambiguous shorthands remain useful when context exists.
    bareCityAliases?: readonly string[];
};

const POPULAR_LOCATIONS: readonly LocationRecord[] = [
    {
        city: "Toronto",
        region: "Ontario",
        country: "Canada",
        countryCode: "CA",
        countryCode3: "CAN",
        adminCode: "08",
        population: 2_794_356,
        regionAliases: ["ON"],
        bareCityAliases: ["Toronto"],
    },
    {
        city: "New York",
        region: "New York",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "NY",
        population: 8_804_190,
        cityAliases: ["New York City", "NYC"],
        bareCityAliases: ["New York", "New York City", "NYC"],
    },
    {
        city: "San Francisco",
        region: "California",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "CA",
        population: 873_965,
        cityAliases: ["SF"],
        bareCityAliases: ["San Francisco", "SF"],
    },
    {
        city: "Seattle",
        region: "Washington",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "WA",
        population: 737_015,
        bareCityAliases: ["Seattle"],
    },
    {
        city: "Austin",
        region: "Texas",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "TX",
        population: 961_855,
        bareCityAliases: ["Austin"],
    },
    {
        city: "Boston",
        region: "Massachusetts",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "MA",
        population: 675_647,
        bareCityAliases: ["Boston"],
    },
    {
        city: "Cambridge",
        region: "Massachusetts",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "MA",
        population: 118_488,
        // Cambridge is deliberately not a bare auto-match because the cities
        // in England and Ontario are also common. It still receives the
        // technology-hub ranking boost in search results.
        bareCityAliases: [],
    },
    {
        city: "Los Angeles",
        region: "California",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "CA",
        population: 3_898_747,
        cityAliases: ["LA"],
        bareCityAliases: ["Los Angeles"],
    },
    {
        city: "San Jose",
        region: "California",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "CA",
        population: 1_013_240,
        bareCityAliases: [],
    },
    {
        city: "San Diego",
        region: "California",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "CA",
        population: 1_386_932,
        bareCityAliases: ["San Diego"],
    },
    {
        city: "Chicago",
        region: "Illinois",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "IL",
        population: 2_746_388,
        bareCityAliases: ["Chicago"],
    },
    {
        city: "St. Louis",
        region: "Missouri",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "MO",
        population: 279_695,
        cityAliases: ["St Louis", "Saint Louis", "STL"],
        bareCityAliases: ["St. Louis", "St Louis", "Saint Louis", "STL"],
    },
    {
        city: "Washington",
        region: "District of Columbia",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "DC",
        population: 689_545,
        cityAliases: ["Washington DC", "DC"],
        bareCityAliases: ["Washington DC", "DC"],
    },
    {
        city: "Denver",
        region: "Colorado",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "CO",
        population: 715_522,
        bareCityAliases: ["Denver"],
    },
    {
        city: "Atlanta",
        region: "Georgia",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "GA",
        population: 498_715,
        bareCityAliases: ["Atlanta"],
    },
    {
        city: "Raleigh",
        region: "North Carolina",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "NC",
        population: 467_665,
        bareCityAliases: ["Raleigh"],
    },
    {
        city: "Dallas",
        region: "Texas",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "TX",
        population: 1_304_379,
        bareCityAliases: ["Dallas"],
    },
    {
        city: "Miami",
        region: "Florida",
        country: "United States",
        countryCode: "US",
        countryCode3: "USA",
        adminCode: "FL",
        population: 442_241,
        bareCityAliases: ["Miami"],
    },
    {
        city: "Vancouver",
        region: "British Columbia",
        country: "Canada",
        countryCode: "CA",
        countryCode3: "CAN",
        adminCode: "02",
        population: 662_248,
        regionAliases: ["BC"],
        bareCityAliases: [],
    },
    {
        city: "Montreal",
        region: "Quebec",
        country: "Canada",
        countryCode: "CA",
        countryCode3: "CAN",
        adminCode: "10",
        population: 1_762_949,
        cityAliases: ["Montréal"],
        regionAliases: ["QC", "Québec"],
        bareCityAliases: ["Montreal", "Montréal"],
    },
    {
        city: "Ottawa",
        region: "Ontario",
        country: "Canada",
        countryCode: "CA",
        countryCode3: "CAN",
        adminCode: "08",
        population: 1_017_449,
        regionAliases: ["ON"],
        bareCityAliases: ["Ottawa"],
    },
    {
        city: "Waterloo",
        region: "Ontario",
        country: "Canada",
        countryCode: "CA",
        countryCode3: "CAN",
        adminCode: "08",
        population: 121_436,
        regionAliases: ["ON"],
        bareCityAliases: [],
    },
    {
        city: "Calgary",
        region: "Alberta",
        country: "Canada",
        countryCode: "CA",
        countryCode3: "CAN",
        adminCode: "01",
        population: 1_306_784,
        regionAliases: ["AB"],
        bareCityAliases: ["Calgary"],
    },
    {
        city: "London",
        region: "England",
        country: "United Kingdom",
        countryCode: "GB",
        countryCode3: "GBR",
        adminCode: "ENG",
        population: 8_961_989,
        bareCityAliases: [],
    },
    {
        city: "Dublin",
        region: "Leinster",
        country: "Ireland",
        countryCode: "IE",
        countryCode3: "IRL",
        adminCode: "L",
        population: 1_024_027,
        bareCityAliases: [],
    },
    {
        city: "Amsterdam",
        region: "North Holland",
        country: "Netherlands",
        countryCode: "NL",
        countryCode3: "NLD",
        adminCode: "07",
        population: 921_402,
        bareCityAliases: ["Amsterdam"],
    },
    {
        city: "The Hague",
        region: "South Holland",
        country: "Netherlands",
        countryCode: "NL",
        countryCode3: "NLD",
        adminCode: "11",
        population: 474_292,
        cityAliases: ["Den Haag", "The Hague", "'s-Gravenhage"],
        countryAliases: ["The Netherlands"],
        bareCityAliases: ["Den Haag", "The Hague", "'s-Gravenhage"],
    },
    {
        city: "Berlin",
        region: "Berlin",
        country: "Germany",
        countryCode: "DE",
        countryCode3: "DEU",
        adminCode: "16",
        population: 3_664_088,
        bareCityAliases: ["Berlin"],
    },
    {
        city: "Cologne",
        region: "North Rhine-Westphalia",
        country: "Germany",
        countryCode: "DE",
        countryCode3: "DEU",
        adminCode: "07",
        population: 1_024_621,
        cityAliases: ["Köln", "Koeln"],
        bareCityAliases: ["Cologne", "Köln", "Koeln"],
    },
    {
        city: "Paris",
        region: "Île-de-France",
        country: "France",
        countryCode: "FR",
        countryCode3: "FRA",
        adminCode: "11",
        population: 2_145_906,
        bareCityAliases: ["Paris"],
    },
    {
        city: "Munich",
        region: "Bavaria",
        country: "Germany",
        countryCode: "DE",
        countryCode3: "DEU",
        adminCode: "02",
        population: 1_488_202,
        cityAliases: ["München"],
        bareCityAliases: ["Munich", "München"],
    },
    {
        city: "Zurich",
        region: "Zurich",
        country: "Switzerland",
        countryCode: "CH",
        countryCode3: "CHE",
        adminCode: "ZH",
        population: 421_878,
        cityAliases: ["Zürich"],
        bareCityAliases: ["Zurich", "Zürich"],
    },
    {
        city: "Stockholm",
        region: "Stockholm",
        country: "Sweden",
        countryCode: "SE",
        countryCode3: "SWE",
        adminCode: "26",
        population: 975_551,
        bareCityAliases: ["Stockholm"],
    },
    {
        city: "Copenhagen",
        region: "Capital Region",
        country: "Denmark",
        countryCode: "DK",
        countryCode3: "DNK",
        adminCode: "17",
        population: 653_664,
        cityAliases: ["København"],
        bareCityAliases: ["Copenhagen", "København"],
    },
    {
        city: "Helsinki",
        region: "Uusimaa",
        country: "Finland",
        countryCode: "FI",
        countryCode3: "FIN",
        adminCode: "18",
        population: 658_457,
        bareCityAliases: ["Helsinki"],
    },
    {
        city: "Lisbon",
        region: "Lisbon",
        country: "Portugal",
        countryCode: "PT",
        countryCode3: "PRT",
        adminCode: "14",
        population: 545_923,
        cityAliases: ["Lisboa"],
        bareCityAliases: ["Lisbon", "Lisboa"],
    },
    {
        city: "Madrid",
        region: "Madrid",
        country: "Spain",
        countryCode: "ES",
        countryCode3: "ESP",
        adminCode: "29",
        population: 3_305_408,
        bareCityAliases: ["Madrid"],
    },
    {
        city: "Barcelona",
        region: "Catalonia",
        country: "Spain",
        countryCode: "ES",
        countryCode3: "ESP",
        adminCode: "56",
        population: 1_636_732,
        bareCityAliases: ["Barcelona"],
    },
    {
        city: "Warsaw",
        region: "Mazovia",
        country: "Poland",
        countryCode: "PL",
        countryCode3: "POL",
        adminCode: "78",
        population: 1_863_056,
        cityAliases: ["Warszawa"],
        bareCityAliases: ["Warsaw", "Warszawa"],
    },
    {
        city: "Kyiv",
        region: "Kyiv City",
        country: "Ukraine",
        countryCode: "UA",
        countryCode3: "UKR",
        adminCode: "12",
        population: 2_952_301,
        cityAliases: ["Kiev"],
        bareCityAliases: ["Kyiv", "Kiev"],
    },
    {
        city: "Prague",
        region: "Prague",
        country: "Czechia",
        countryCode: "CZ",
        countryCode3: "CZE",
        adminCode: "52",
        population: 1_275_406,
        cityAliases: ["Praha"],
        bareCityAliases: ["Prague", "Praha"],
    },
    {
        city: "Tallinn",
        region: "Harjumaa",
        country: "Estonia",
        countryCode: "EE",
        countryCode3: "EST",
        adminCode: "01",
        population: 437_811,
        bareCityAliases: ["Tallinn"],
    },
    {
        city: "Bengaluru",
        region: "Karnataka",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "19",
        population: 8_443_675,
        cityAliases: ["Bangalore"],
        regionAliases: ["KA"],
        bareCityAliases: ["Bengaluru", "Bangalore"],
    },
    {
        city: "Hyderabad",
        region: "Telangana",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "40",
        population: 6_809_970,
        regionAliases: ["TS", "TG"],
        bareCityAliases: [],
    },
    {
        city: "Mumbai",
        region: "Maharashtra",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "16",
        population: 12_442_373,
        cityAliases: ["Bombay"],
        regionAliases: ["MH"],
        bareCityAliases: ["Mumbai", "Bombay"],
    },
    {
        city: "Delhi",
        region: "Delhi",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "07",
        population: 11_034_555,
        cityAliases: ["New Delhi"],
        regionAliases: ["DL"],
        bareCityAliases: ["Delhi", "New Delhi"],
    },
    {
        city: "Pune",
        region: "Maharashtra",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "16",
        population: 3_124_458,
        regionAliases: ["MH"],
        bareCityAliases: ["Pune"],
    },
    {
        city: "Chennai",
        region: "Tamil Nadu",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "25",
        population: 4_681_087,
        cityAliases: ["Madras"],
        regionAliases: ["TN"],
        bareCityAliases: ["Chennai", "Madras"],
    },
    {
        city: "Kolkata",
        region: "West Bengal",
        country: "India",
        countryCode: "IN",
        countryCode3: "IND",
        adminCode: "28",
        population: 4_631_392,
        cityAliases: ["Calcutta"],
        regionAliases: ["WB"],
        bareCityAliases: ["Kolkata", "Calcutta"],
    },
    {
        city: "Singapore",
        region: "Singapore",
        country: "Singapore",
        countryCode: "SG",
        countryCode3: "SGP",
        adminCode: "00",
        population: 5_453_600,
        bareCityAliases: ["Singapore"],
    },
    {
        city: "Ho Chi Minh City",
        region: "Ho Chi Minh City",
        country: "Vietnam",
        countryCode: "VN",
        countryCode3: "VNM",
        adminCode: "79",
        population: 14_002_598,
        cityAliases: ["Saigon", "Sai Gon", "HCMC"],
        bareCityAliases: ["Ho Chi Minh City", "Saigon", "Sai Gon", "HCMC"],
    },
    {
        city: "Tokyo",
        region: "Tokyo",
        country: "Japan",
        countryCode: "JP",
        countryCode3: "JPN",
        adminCode: "40",
        population: 14_047_594,
        bareCityAliases: ["Tokyo"],
    },
    {
        city: "Beijing",
        region: "Beijing",
        country: "China",
        countryCode: "CN",
        countryCode3: "CHN",
        adminCode: "22",
        population: 18_960_744,
        cityAliases: ["Peking"],
        bareCityAliases: ["Beijing", "Peking"],
    },
    {
        city: "Seoul",
        region: "Seoul",
        country: "South Korea",
        countryCode: "KR",
        countryCode3: "KOR",
        adminCode: "11",
        population: 9_586_195,
        bareCityAliases: ["Seoul"],
    },
    {
        city: "Taipei",
        region: "Taipei City",
        country: "Taiwan",
        countryCode: "TW",
        countryCode3: "TWN",
        adminCode: "03",
        population: 2_494_813,
        bareCityAliases: ["Taipei"],
    },
    {
        city: "Hong Kong",
        region: "Hong Kong",
        country: "Hong Kong",
        countryCode: "HK",
        countryCode3: "HKG",
        adminCode: "HCW",
        population: 7_413_070,
        bareCityAliases: ["Hong Kong"],
    },
    {
        city: "Sydney",
        region: "New South Wales",
        country: "Australia",
        countryCode: "AU",
        countryCode3: "AUS",
        adminCode: "02",
        population: 5_312_163,
        regionAliases: ["NSW"],
        bareCityAliases: ["Sydney"],
    },
    {
        city: "Melbourne",
        region: "Victoria",
        country: "Australia",
        countryCode: "AU",
        countryCode3: "AUS",
        adminCode: "07",
        population: 5_078_193,
        regionAliases: ["VIC"],
        bareCityAliases: ["Melbourne"],
    },
    {
        city: "Auckland",
        region: "Auckland",
        country: "New Zealand",
        countryCode: "NZ",
        countryCode3: "NZL",
        adminCode: "E7",
        population: 1_571_718,
        bareCityAliases: ["Auckland"],
    },
    {
        city: "Tel Aviv",
        region: "Tel Aviv",
        country: "Israel",
        countryCode: "IL",
        countryCode3: "ISR",
        adminCode: "05",
        population: 467_875,
        cityAliases: ["Tel Aviv-Yafo"],
        bareCityAliases: ["Tel Aviv", "Tel Aviv-Yafo"],
    },
    {
        city: "Dubai",
        region: "Dubai",
        country: "United Arab Emirates",
        countryCode: "AE",
        countryCode3: "ARE",
        adminCode: "03",
        population: 3_478_300,
        bareCityAliases: ["Dubai"],
    },
    {
        city: "Mexico City",
        region: "Mexico City",
        country: "Mexico",
        countryCode: "MX",
        countryCode3: "MEX",
        adminCode: "09",
        population: 9_209_944,
        cityAliases: ["Ciudad de México", "CDMX"],
        bareCityAliases: ["Mexico City", "Ciudad de México", "CDMX"],
    },
    {
        city: "São Paulo",
        region: "São Paulo",
        country: "Brazil",
        countryCode: "BR",
        countryCode3: "BRA",
        adminCode: "27",
        population: 12_325_232,
        cityAliases: ["Sao Paulo"],
        regionAliases: ["SP"],
        bareCityAliases: ["São Paulo", "Sao Paulo"],
    },
];

const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
    AE: ["UAE"],
    CZ: ["Czech Republic"],
    GB: ["UK", "Great Britain", "Britain"],
    HK: ["Hong Kong SAR"],
    KR: ["Republic of Korea", "Korea"],
    NL: ["The Netherlands"],
    US: ["United States of America", "America"],
};

const REGION_CODE_ALIASES: Readonly<Record<string, string>> = {
    // Canada
    "CA:alberta": "AB",
    "CA:british columbia": "BC",
    "CA:manitoba": "MB",
    "CA:new brunswick": "NB",
    "CA:newfoundland and labrador": "NL",
    "CA:northwest territories": "NT",
    "CA:nova scotia": "NS",
    "CA:nunavut": "NU",
    "CA:ontario": "ON",
    "CA:prince edward island": "PE",
    "CA:quebec": "QC",
    "CA:saskatchewan": "SK",
    "CA:yukon": "YT",
    // Australia
    "AU:australian capital territory": "ACT",
    "AU:new south wales": "NSW",
    "AU:northern territory": "NT",
    "AU:queensland": "QLD",
    "AU:south australia": "SA",
    "AU:tasmania": "TAS",
    "AU:victoria": "VIC",
    "AU:western australia": "WA",
    // Major Indian technology regions
    "IN:delhi": "DL",
    "IN:karnataka": "KA",
    "IN:maharashtra": "MH",
    "IN:tamil nadu": "TN",
    "IN:telangana": "TS",
    "IN:uttar pradesh": "UP",
    "IN:west bengal": "WB",
    // Major Brazilian technology regions
    "BR:bahia": "BA",
    "BR:ceara": "CE",
    "BR:distrito federal": "DF",
    "BR:minas gerais": "MG",
    "BR:parana": "PR",
    "BR:pernambuco": "PE",
    "BR:rio de janeiro": "RJ",
    "BR:rio grande do sul": "RS",
    "BR:santa catarina": "SC",
    "BR:sao paulo": "SP",
    // Mexico. These are the postal/ISO abbreviations job boards commonly use;
    // GeoNames admin codes for Mexico are numeric and cannot match them alone.
    "MX:aguascalientes": "AGU",
    "MX:baja california": "BCN",
    "MX:baja california sur": "BCS",
    "MX:campeche": "CAM",
    "MX:chiapas": "CHP",
    "MX:chihuahua": "CHH",
    "MX:coahuila": "COA",
    "MX:colima": "COL",
    "MX:durango": "DUR",
    "MX:guanajuato": "GUA",
    "MX:guerrero": "GRO",
    "MX:hidalgo": "HID",
    "MX:jalisco": "JAL",
    "MX:mexico": "MEX",
    "MX:mexico city": "CMX",
    "MX:michoacan": "MIC",
    "MX:morelos": "MOR",
    "MX:nayarit": "NAY",
    "MX:nuevo leon": "NL",
    "MX:oaxaca": "OAX",
    "MX:puebla": "PUE",
    "MX:queretaro": "QUE",
    "MX:quintana roo": "ROO",
    "MX:san luis potosi": "SLP",
    "MX:sinaloa": "SIN",
    "MX:sonora": "SON",
    "MX:tabasco": "TAB",
    "MX:tamaulipas": "TAM",
    "MX:tlaxcala": "TLA",
    "MX:veracruz": "VER",
    "MX:yucatan": "YUC",
    "MX:zacatecas": "ZAC",
};

const INITIALS = /\b([a-z])\.(?=[a-z]\.?)/gi;
const ARRANGEMENT_WORDS =
    /\b(?:fully\s+remote|remote(?:[\s-]+first)?|hybrid|on[\s-]?site|in[\s-]+office)\b/giu;

export const normalizeLocationPhrase = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(INITIALS, "$1")
        .toLocaleLowerCase("en")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");

export const locationWords = (value: string): string[] => {
    const withoutArrangement = value.replace(ARRANGEMENT_WORDS, " ");
    const normalized = normalizeLocationPhrase(withoutArrangement);
    return normalized ? normalized.split(" ") : [];
};

export const locationFingerprint = (value: string): string =>
    locationWords(value).sort().join(" ");

const uniqueNormalized = (values: readonly string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const normalized = normalizeLocationPhrase(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(value);
    }
    return result;
};

export const countryAliasesFor = (
    country: string,
    countryCode: string,
    countryCode3: string,
    extra: readonly string[] = [],
): string[] =>
    uniqueNormalized([
        country,
        countryCode,
        countryCode3,
        ...(COUNTRY_ALIASES[countryCode] ?? []),
        ...extra,
    ]);

export const regionAliasesFor = (
    countryCode: string,
    region: string,
    adminCode: string,
    extra: readonly string[] = [],
): string[] => {
    if (!region) return [];
    const normalizedRegion = normalizeLocationPhrase(region);
    const friendlyCode =
        REGION_CODE_ALIASES[`${countryCode}:${normalizedRegion}`];
    const geoCode = /^[a-z]{1,3}$/i.test(adminCode) ? adminCode : "";
    return uniqueNormalized([region, friendlyCode ?? "", geoCode, ...extra]);
};

export const canonicalLocation = (record: LocationRecord): string => {
    return [record.city, record.region, record.country]
        .filter((part) => normalizeLocationPhrase(part).length > 0)
        .join(", ");
};

const addResult = (
    index: Map<string, Set<string>>,
    value: string,
    location: string,
) => {
    const key = locationFingerprint(value);
    if (!key) return;
    const matches = index.get(key) ?? new Set<string>();
    matches.add(location);
    index.set(key, matches);
};

const popularIndex = (): Map<string, Set<string>> => {
    const index = new Map<string, Set<string>>();
    for (const record of POPULAR_LOCATIONS) {
        const location = canonicalLocation(record);
        const cityAliases = uniqueNormalized([
            record.city,
            ...(record.cityAliases ?? []),
        ]);
        const regionAliases = regionAliasesFor(
            record.countryCode,
            record.region,
            record.adminCode,
            record.regionAliases,
        );
        const countryAliases = countryAliasesFor(
            record.country,
            record.countryCode,
            record.countryCode3,
            record.countryAliases,
        );

        for (const city of record.bareCityAliases ?? []) {
            addResult(index, city, location);
        }
        for (const city of cityAliases) {
            for (const region of regionAliases) {
                addResult(index, `${city} ${region}`, location);
            }
            for (const country of countryAliases) {
                addResult(index, `${city} ${country}`, location);
            }
            for (const region of regionAliases) {
                for (const country of countryAliases) {
                    addResult(index, `${city} ${region} ${country}`, location);
                }
            }
        }
    }
    return index;
};

const POPULAR_INDEX = popularIndex();

const POPULAR_COUNTRY_CODES = new Map(
    POPULAR_LOCATIONS.map((record) => [
        canonicalLocation(record),
        record.countryCode,
    ]),
);

type PopularSearchRecord = {
    label: string;
    population: number;
    priority: number;
    cityAliases: string[];
    words: string[];
};

const POPULAR_SEARCH_RECORDS: PopularSearchRecord[] = POPULAR_LOCATIONS.map(
    (record, priority) => {
        const cityAliases = uniqueNormalized([
            record.city,
            ...(record.cityAliases ?? []),
        ]).map(normalizeLocationPhrase);
        const searchable = uniqueNormalized([
            ...cityAliases,
            ...regionAliasesFor(
                record.countryCode,
                record.region,
                record.adminCode,
                record.regionAliases,
            ),
            ...countryAliasesFor(
                record.country,
                record.countryCode,
                record.countryCode3,
                record.countryAliases,
            ),
        ]);
        return {
            label: canonicalLocation(record),
            population: record.population,
            priority,
            cityAliases,
            words: searchable.flatMap((value) =>
                normalizeLocationPhrase(value).split(" "),
            ),
        };
    },
);

const POPULAR_PRIORITIES = new Map(
    POPULAR_SEARCH_RECORDS.map((record) => [record.label, record.priority]),
);

export const popularLocationPriority = (location: string): number =>
    POPULAR_PRIORITIES.get(location) ?? Number.MAX_SAFE_INTEGER;

const wordsMatchPrefixes = (
    queryWords: readonly string[],
    candidateWords: readonly string[],
): boolean => {
    const used = new Set<number>();
    return queryWords.every((queryWord) => {
        const at = candidateWords.findIndex(
            (candidateWord, index) =>
                !used.has(index) && candidateWord.startsWith(queryWord),
        );
        if (at < 0) return false;
        used.add(at);
        return true;
    });
};

// Optimal string alignment distance with a small ceiling. This runs over the
// curated list only, so popular-city typo suggestions remain instant in the
// browser without adding the worldwide data to the client bundle.
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

export const resolvePopularLocation = (
    raw: string | null,
): ImportedLocationResolution => {
    if (!raw?.trim()) return { status: "unmatched" };
    const matches = POPULAR_INDEX.get(locationFingerprint(raw));
    if (!matches || matches.size === 0) return { status: "unmatched" };
    const suggestions = [...matches];
    if (suggestions.length > 1) return { status: "suggestions", suggestions };
    const location = suggestions[0];
    return {
        status: "matched",
        location,
        countryCode: POPULAR_COUNTRY_CODES.get(location) ?? null,
    };
};

// Keystrokes only search the deliberately small technology-hub list. Matching
// requires at least one city-name prefix, so entering a country by itself does
// not produce an arbitrary list of its largest cities. Full worldwide results
// arrive from the server after the input's debounce.
export const searchPopularLocations = (raw: string, limit = 8): string[] => {
    const query = normalizeLocationPhrase(raw);
    if (limit < 1) return [];
    if (!query) {
        return POPULAR_SEARCH_RECORDS.slice(0, limit).map(
            (record) => record.label,
        );
    }
    if (query.length < 2) return [];

    const resolved = resolvePopularLocation(raw);
    if (resolved.status === "matched") return [resolved.location];
    if (resolved.status === "suggestions") {
        return resolved.suggestions.slice(0, limit);
    }

    const queryWords = query.split(" ");
    return POPULAR_SEARCH_RECORDS.map((record) => {
        const exactCity = record.cityAliases.includes(query);
        const cityPhrasePrefix = record.cityAliases.some((alias) =>
            alias.startsWith(query),
        );
        const cityWordPrefix = queryWords.some((queryWord) =>
            record.cityAliases.some((alias) =>
                alias
                    .split(" ")
                    .some((cityWord) => cityWord.startsWith(queryWord)),
            ),
        );
        const prefixMatch =
            cityWordPrefix && wordsMatchPrefixes(queryWords, record.words);
        const allowance = typoAllowance(query);
        const typoDistance =
            prefixMatch || allowance === 0
                ? allowance + 1
                : Math.min(
                      ...record.cityAliases.map((alias) =>
                          editDistance(query, alias, allowance),
                      ),
                  );
        if (!prefixMatch && typoDistance > allowance) {
            return null;
        }
        return {
            label: record.label,
            population: record.population,
            priority: record.priority,
            score: exactCity ? 4 : cityPhrasePrefix ? 3 : prefixMatch ? 2 : 1,
            typoDistance,
        };
    })
        .filter(
            (
                match,
            ): match is {
                label: string;
                population: number;
                priority: number;
                score: number;
                typoDistance: number;
            } => match !== null,
        )
        .sort(
            (left, right) =>
                right.score - left.score ||
                left.typoDistance - right.typoDistance ||
                left.priority - right.priority ||
                right.population - left.population ||
                left.label.localeCompare(right.label, "en"),
        )
        .slice(0, limit)
        .map((match) => match.label);
};
