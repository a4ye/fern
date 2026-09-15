// Pure job-posting extraction shared by the Next.js server and the browser
// extension. Keep network and browser-extension APIs out of this module so the
// exact same parser can run in either environment.

export type JobArrangement = "remote" | "hybrid" | "onsite";

export type PostingSource =
    | "json-ld"
    | "opengraph"
    | "greenhouse"
    | "lever"
    | "ashby"
    | "simplify"
    | "rippling"
    | "none";

export type ScrapedPosting = {
    company: string | null;
    role: string | null;
    location: string | null;
    arrangement: JobArrangement | null;
    pay: string | null;
    // What the offer carries besides a salary: equity, a bonus, commission. A
    // board states these as a fact rather than an amount ("Offers Equity"), so
    // they belong in the note beside the pay and not in a number column.
    payNote: string | null;
    source: PostingSource;
    // The employer's own posting, where the link given was an aggregator's.
    // Offered to the user rather than swapped in: it is a third party's claim
    // about where the listing came from, and only they can vouch for it.
    employerUrl: string | null;
};

export const EMPTY_POSTING: ScrapedPosting = {
    company: null,
    role: null,
    location: null,
    arrangement: null,
    pay: null,
    payNote: null,
    source: "none",
    employerUrl: null,
};

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

// Titles and company names arrive HTML-escaped from both JSON-LD and meta tags,
// so "GenAI &amp; ML" would otherwise be stored and displayed verbatim.
const decodeEntities = (value: string): string =>
    value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
        if (entity.startsWith("#")) {
            const code =
                entity.startsWith("#x") || entity.startsWith("#X")
                    ? Number.parseInt(entity.slice(2), 16)
                    : Number.parseInt(entity.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });

const asString = (value: unknown): string | null =>
    typeof value === "string" && value.trim()
        ? decodeEntities(value).replace(/\s+/g, " ").trim()
        : null;

// Salary fields arrive as `number` from some boards and as `string` from others,
// and a string one may carry the grouping a person would write.
const asNumber = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = asString(value);
    if (text === null) return null;
    const parsed = Number(text.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
};

// JSON-LD nodes are untyped external data, so we narrow defensively.
type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const typeMatches = (node: JsonObject, wanted: string): boolean => {
    const type = node["@type"];
    if (typeof type === "string") return type === wanted;
    if (Array.isArray(type)) return type.includes(wanted);
    return false;
};

// Walk arbitrarily nested JSON-LD (arrays, @graph containers) for the first
// node of the requested @type.
const findNode = (root: unknown, wanted: string): JsonObject | null => {
    const stack: unknown[] = [root];
    while (stack.length) {
        const current = stack.pop();
        if (Array.isArray(current)) {
            stack.push(...current);
        } else if (isObject(current)) {
            if (typeMatches(current, wanted)) return current;
            stack.push(...Object.values(current));
        }
    }
    return null;
};

const readLocation = (posting: JsonObject): string | null => {
    const raw = posting["jobLocation"];
    const node = Array.isArray(raw) ? raw[0] : raw;
    if (!isObject(node)) return null;
    const address = node["address"];
    if (!isObject(address)) return null;
    const city = asString(address["addressLocality"]);
    const region = asString(address["addressRegion"]);
    const countryNode = address["addressCountry"];
    const country = isObject(countryNode)
        ? asString(countryNode["name"])
        : asString(countryNode);
    return [city, region, country].filter(Boolean).join(", ") || null;
};

// Emitted as a suffix on the pay string, which parsePay reads back into the
// pay_period column. "DAY" has no column, so it is left off rather than faked.
const PAY_PERIOD: Record<string, string> = {
    HOUR: "/hr",
    WEEK: "/wk",
    MONTH: "/mo",
    YEAR: "/yr",
};

// Every provider that states pay in numbers is put through here, so what
// parsePay reads back is always "USD 140000-188000/yr" and never the board's own
// display text. A board writes that text for a person ("CA$140K – CA$188K"), and
// reading it back is a guess at the currency and a chance to lose an end of the
// range; the numbers beside it are neither.
export const payText = (
    min: number | null,
    max: number | null,
    currency: string | null,
    period: string | null,
): string | null => {
    const low = min ?? max;
    if (low === null) return null;
    const high = max ?? min;
    const amount = high !== null && high !== low ? `${low}-${high}` : `${low}`;
    return (
        [asString(currency), amount].filter(Boolean).join(" ") + (period ?? "")
    );
};

const periodSuffix = (unit: string | null): string =>
    unit ? (PAY_PERIOD[unit.toUpperCase()] ?? "") : "";

const REMOTE_TEXT = /\bremote\b/i;
const HYBRID_TEXT = /\bhybrid\b/i;
const ONSITE_TEXT = /\bon-?site\b|\bin[-\s]office\b/i;

export const arrangementFromText = (
    value: string | null,
): JobArrangement | null => {
    if (!value) return null;
    if (HYBRID_TEXT.test(value)) return "hybrid";
    if (REMOTE_TEXT.test(value)) return "remote";
    if (ONSITE_TEXT.test(value)) return "onsite";
    return null;
};

// A title that says "(Fully Remote)" is the posting stating the arrangement in
// the one place a page is certain to carry, and it is the only word here on a
// posting whose block gives a plain city. Against 5,220 postings whose board
// states the arrangement outright, a title that speaks was never wrong, and
// never disagreed with the location text either.
const readArrangement = (
    posting: JsonObject,
    role: string | null,
    location: string | null,
): JobArrangement | null => {
    const type = asString(posting["jobLocationType"]);
    if (type?.toUpperCase() === "TELECOMMUTE") return "remote";
    return arrangementFromText(role) ?? arrangementFromText(location);
};

const readPay = (posting: JsonObject): string | null => {
    const salary = posting["baseSalary"];
    if (!isObject(salary)) return null;
    const value = salary["value"];
    if (!isObject(value)) return null;
    const exact = asNumber(value["value"]);
    return payText(
        exact ?? asNumber(value["minValue"]),
        exact ?? asNumber(value["maxValue"]),
        asString(salary["currency"]),
        periodSuffix(asString(value["unitText"])),
    );
};

const fromJsonLd = (html: string): ScrapedPosting | null => {
    const blocks = html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    );
    for (const block of blocks) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(block[1].trim());
        } catch {
            continue;
        }
        const posting = findNode(parsed, "JobPosting");
        if (!posting) continue;

        const org = posting["hiringOrganization"];
        const location = readLocation(posting);
        const role = asString(posting["title"]);
        return {
            role,
            company: isObject(org) ? asString(org["name"]) : null,
            location,
            arrangement: readArrangement(posting, role, location),
            pay: readPay(posting),
            payNote: null,
            source: "json-ld",
            employerUrl: null,
        };
    }
    return null;
};

// Both Simplify and Rippling are Next.js boards that leave the posting itself
// out of the markup. Their page data takes precedence over the schema.org and
// OpenGraph fallbacks when it is present.
const nextPageData = (html: string): unknown => {
    const match = html.match(
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    );
    if (!match) return null;
    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
};

const dig = (root: unknown, ...keys: string[]): unknown => {
    let node = root;
    for (const key of keys) {
        if (!isObject(node)) return null;
        node = node[key];
    }
    return node;
};

const SIMPLIFY_PERIOD: Record<number, string> = { 1: "/hr", 4: "/yr" };

const simplifyPay = (posting: JsonObject): string | null => {
    const period = posting["salary_period"];
    return payText(
        asNumber(posting["min_salary"]),
        asNumber(posting["max_salary"]),
        asString(posting["currency_type"]),
        typeof period === "number" ? (SIMPLIFY_PERIOD[period] ?? "") : "",
    );
};

const fromSimplify = (html: string): ScrapedPosting | null => {
    const posting = dig(nextPageData(html), "props", "pageProps", "jobPosting");
    if (!isObject(posting)) return null;

    const role = asString(posting["title"]);
    const company = asString(dig(posting, "job", "company", "name"));
    if (!role && !company) return null;

    const places = posting["locations"];
    const place = Array.isArray(places) ? places[0] : places;
    const location = isObject(place) ? asString(place["value"]) : null;
    return {
        role,
        company,
        location,
        arrangement: arrangementFromText(location),
        pay: simplifyPay(posting),
        payNote: null,
        source: "simplify",
        employerUrl: null,
    };
};

// One range is the ordinary case. Where a board lists several they are per
// location, and nothing in the payload says which one this posting is offered
// at, so the choice is left to the person rather than made by picking a row.
const ripplingPay = (job: JsonObject): string | null => {
    const ranges = job["payRangeDetails"];
    if (!Array.isArray(ranges) || ranges.length !== 1) return null;
    const range: unknown = ranges[0];
    if (!isObject(range)) return null;

    return payText(
        asNumber(range["rangeStart"]),
        asNumber(range["rangeEnd"]),
        asString(range["currency"]),
        periodSuffix(asString(range["frequency"])),
    );
};

// The same shape whether it came from Rippling's board API or from the page
// data the board ships to its own front end.
export const parseRipplingJob = (value: unknown): ScrapedPosting | null => {
    if (!isObject(value)) return null;
    const role = asString(value["name"]);
    const company =
        asString(value["companyName"]) ??
        asString(dig(value, "board", "companyName"));
    if (!role && !company) return null;

    // Rippling writes the arrangement into the location itself, as "Remote
    // (San Francisco Bay Area)" or "Hybrid (Washington, ...)", and has no
    // separate field for it.
    const places = value["workLocations"];
    const location = Array.isArray(places) ? asString(places[0]) : null;
    return {
        role,
        company,
        location,
        arrangement: arrangementFromText(location),
        pay: ripplingPay(value),
        payNote: null,
        source: "rippling",
        employerUrl: null,
    };
};

// A Rippling posting read from its own page. Worth doing before the fallbacks
// below get to it: the meta tags name the board rather than the employer, so
// every posting on every Rippling board would otherwise come back as a job at
// "Rippling Recruiting".
const fromRippling = (html: string): ScrapedPosting | null =>
    parseRipplingJob(
        dig(nextPageData(html), "props", "pageProps", "apiData", "jobPost"),
    );

// Attributes are read out of the tag separately because Next.js can emit
// `content` before `property`, and a single pattern would fix only one order.
const metaContent = (html: string, property: string): string | null => {
    for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
        const key = tag.match(/(?:property|name)=["']([^"']*)["']/i)?.[1];
        if (key?.toLowerCase() !== property) continue;
        return asString(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null);
    }
    return null;
};

const SIMPLIFY_TITLE = /^(.*) @ (.*) \| Simplify$/;

const fromOpenGraph = (html: string): ScrapedPosting => {
    const title = metaContent(html, "og:title");
    const site = metaContent(html, "og:site_name");
    if (!title && !site) return EMPTY_POSTING;
    const simplify = title?.match(SIMPLIFY_TITLE);
    const role = simplify?.[1] ?? title;
    return {
        role,
        company: simplify?.[2] ?? site,
        location: null,
        arrangement: arrangementFromText(role),
        pay: null,
        payNote: null,
        source: "opengraph",
        employerUrl: null,
    };
};

// Lever and Ashby both name the arrangement on the page itself: Lever prints it
// in a labelled tag beside the location, Ashby ships it in the data the page is
// built from. It overrides what the readers above found rather than only
// filling a blank, because schema.org has one word for working away from an
// office and none for splitting the week. Ashby marks a hybrid posting
// TELECOMMUTE all the same, and the block alone calls that job remote.
const PAGE_WORKPLACE = [
    /class="[^"]*\bworkplaceTypes\b[^"]*"[^>]*>([^<]*)</i,
    /"workplaceType"\s*:\s*"([^"]*)"/i,
];

const arrangementFromPage = (html: string): JobArrangement | null => {
    for (const pattern of PAGE_WORKPLACE) {
        const stated = arrangementFromText(html.match(pattern)?.[1] ?? null);
        if (stated) return stated;
    }
    return null;
};

export const parsePosting = (html: string): ScrapedPosting => {
    const posting =
        fromSimplify(html) ??
        fromRippling(html) ??
        fromJsonLd(html) ??
        fromOpenGraph(html);
    const stated = arrangementFromPage(html);
    return stated ? { ...posting, arrangement: stated } : posting;
};

const titleCase = (slug: string): string =>
    slug
        .replace(/[-_]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");

const GREENHOUSE_HOST = /(^|\.)greenhouse\.io$/;

// The board a Greenhouse link belongs to. An embedded application form states it
// in `for`, because the first path segment there is the word "embed" rather than
// anyone's company.
const greenhouseBoard = (url: URL): string | null => {
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] === "embed"
        ? url.searchParams.get("for")
        : (parts[0] ?? null);
};

export const companyFromUrl = (url: URL): string | null => {
    if (url.hostname.endsWith("myworkdayjobs.com")) {
        return titleCase(url.hostname.split(".")[0]);
    }
    if (GREENHOUSE_HOST.test(url.hostname)) {
        const board = greenhouseBoard(url);
        return board ? titleCase(board) : null;
    }
    if (/(^|\.)(lever\.co|ashbyhq\.com)$/.test(url.hostname)) {
        const slug = url.pathname.split("/").filter(Boolean)[0];
        return slug ? titleCase(slug) : null;
    }
    return null;
};

export const greenhouseIds = (
    url: URL,
): { slug: string; id: string } | null => {
    if (!GREENHOUSE_HOST.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = greenhouseBoard(url);

    // An embedded form states the job in `token`. The `jr_id` beside it is a
    // different id, and the board API answers 404 to it.
    if (parts[0] === "embed") {
        const id = url.searchParams.get("token");
        return slug && id ? { slug, id } : null;
    }

    const jobsIndex = parts.indexOf("jobs");
    const id =
        jobsIndex >= 0 ? parts[jobsIndex + 1] : url.searchParams.get("gh_jid");
    return slug && id ? { slug, id } : null;
};

// Simplify's page names the job but reaches the employer's own posting through
// a redirect, so that address is asked for by id rather than read out of the
// markup. Null for any other link, and for a Simplify page that is not a
// posting.
export const simplifyClickUrl = (url: URL): string | null => {
    if (!/(^|\.)simplify\.jobs$/.test(url.hostname)) return null;
    const [section, id] = url.pathname.split("/").filter(Boolean);
    return section === "p" && id
        ? `https://simplify.jobs/jobs/click/${id}`
        : null;
};

// Where that redirect led, minus the campaign Simplify tags it with. A
// destination still on Simplify is the aggregator answering with itself, which
// is no employer link at all.
export const employerLink = (raw: string): string | null => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (/(^|\.)simplify\.jobs$/.test(url.hostname)) return null;

    for (const param of [...url.searchParams.keys()]) {
        const normalized = param.toLowerCase();
        if (normalized === "gh_src" || normalized.startsWith("utm_")) {
            url.searchParams.delete(param);
        }
    }
    return url.toString();
};

// Greenhouse gives the range no interval of its own, only the heading it is
// printed under, so the period is taken where that heading states one ("Annual
// Salary:") and left unset where it does not ("Local Pay Range"). Guessing it
// from the size of the number would be a guess about someone's salary.
const GREENHOUSE_PERIOD: [RegExp, string][] = [
    [/\bhourly\b|\bper hour\b/i, "/hr"],
    [/\bweekly\b/i, "/wk"],
    [/\bmonthly\b/i, "/mo"],
    [/\bannual(?:ly)?\b|\byearly\b/i, "/yr"],
];

// Several ranges are per location or per pay zone, and nothing in the payload
// says which one this posting is offered at, so the choice is left to the person
// rather than made by picking a row. The same rule the Rippling reader follows.
const greenhousePay = (job: JsonObject): string | null => {
    const ranges = job["pay_input_ranges"];
    if (!Array.isArray(ranges) || ranges.length !== 1) return null;
    const range: unknown = ranges[0];
    if (!isObject(range)) return null;

    const title = asString(range["title"]) ?? "";
    const period = GREENHOUSE_PERIOD.find(([pattern]) => pattern.test(title));
    const cents = (value: unknown): number | null => {
        const amount = asNumber(value);
        return amount === null ? null : amount / 100;
    };
    return payText(
        cents(range["min_cents"]),
        cents(range["max_cents"]),
        asString(range["currency_type"]),
        period?.[1] ?? "",
    );
};

// Greenhouse has no workplace field of its own, so a board that wants one adds
// it to the posting under a name of its choosing, "Workplace Type" or "Location
// Type". A field is only followed where its value reads as an arrangement,
// which leaves a "Location Type" of "Warehouse" as the nothing it is.
const GREENHOUSE_WORKPLACE_FIELD =
    /\b(?:workplace|(?:work\s*)?location)\s*type\b/i;

const greenhouseArrangement = (job: JsonObject): JobArrangement | null => {
    const fields = job["metadata"];
    if (!Array.isArray(fields)) return null;
    for (const field of fields) {
        if (!isObject(field)) continue;
        const name = asString(field["name"]);
        if (!name || !GREENHOUSE_WORKPLACE_FIELD.test(name)) continue;
        const stated = arrangementFromText(asString(field["value"]));
        if (stated) return stated;
    }
    return null;
};

export const parseGreenhouseJob = (value: unknown): ScrapedPosting | null => {
    if (!isObject(value)) return null;
    const node = value["location"];
    const location = isObject(node) ? asString(node["name"]) : null;
    const role = asString(value["title"]);
    const company = asString(value["company_name"]);
    if (!role && !company) return null;
    return {
        role,
        company,
        location,
        arrangement:
            greenhouseArrangement(value) ?? arrangementFromText(location),
        pay: greenhousePay(value),
        payNote: null,
        source: "greenhouse",
        employerUrl: null,
    };
};

export const withUrlFallback = (
    posting: ScrapedPosting,
    url: URL,
): ScrapedPosting => ({
    ...posting,
    company: posting.company ?? companyFromUrl(url),
});

export const hasPostingSuggestion = (posting: ScrapedPosting): boolean =>
    Boolean(
        posting.company ||
        posting.role ||
        posting.location ||
        posting.arrangement ||
        posting.pay ||
        posting.payNote,
    );

export const POSTING_SOURCES = [
    "json-ld",
    "opengraph",
    "greenhouse",
    "lever",
    "ashby",
    "simplify",
    "rippling",
    "none",
] as const satisfies readonly PostingSource[];

const KNOWN_SOURCE = new Set<PostingSource>(POSTING_SOURCES);

const nullableString = (value: unknown): value is string | null =>
    value === null || typeof value === "string";

// The extension is installed unpacked from a download, so a copy someone loaded
// months ago is the copy that speaks to the page today. A field added since then
// is missing rather than null, and missing has to mean the same thing as null:
// read any stricter, every extension already out there stops importing at all.
const absentOrString = (value: unknown): value is string | null =>
    value === undefined || nullableString(value);

export const isScrapedPosting = (value: unknown): value is ScrapedPosting => {
    if (!isObject(value)) return false;
    return (
        nullableString(value["company"]) &&
        nullableString(value["role"]) &&
        nullableString(value["location"]) &&
        (value["arrangement"] === null ||
            value["arrangement"] === "remote" ||
            value["arrangement"] === "hybrid" ||
            value["arrangement"] === "onsite") &&
        nullableString(value["pay"]) &&
        absentOrString(value["payNote"]) &&
        KNOWN_SOURCE.has(value["source"] as PostingSource) &&
        nullableString(value["employerUrl"])
    );
};
