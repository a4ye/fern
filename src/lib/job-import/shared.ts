// Pure job-posting extraction shared by the Next.js server and the browser
// extension. Keep network and browser-extension APIs out of this module so the
// exact same parser can run in either environment.

export type JobArrangement = "remote" | "hybrid" | "onsite";

export type PostingSource =
    "json-ld" | "opengraph" | "greenhouse" | "simplify" | "none";

export type ScrapedPosting = {
    company: string | null;
    role: string | null;
    location: string | null;
    arrangement: JobArrangement | null;
    pay: string | null;
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

// JSON-LD numbers arrive as `number`, not `string`, so salary fields need this.
const asNumeric = (value: unknown): string | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return asString(value);
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
    return [city, region].filter(Boolean).join(", ") || null;
};

// Emitted as a suffix on the pay string, which parsePay reads back into the
// pay_period column. "DAY" has no column, so it is left off rather than faked.
const PAY_PERIOD: Record<string, string> = {
    HOUR: "/hr",
    WEEK: "/wk",
    MONTH: "/mo",
    YEAR: "/yr",
};

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

const readArrangement = (
    posting: JsonObject,
    location: string | null,
): JobArrangement | null => {
    const type = asString(posting["jobLocationType"]);
    if (type?.toUpperCase() === "TELECOMMUTE") return "remote";
    return arrangementFromText(location);
};

const readPay = (posting: JsonObject): string | null => {
    const salary = posting["baseSalary"];
    if (!isObject(salary)) return null;
    const value = salary["value"];
    if (!isObject(value)) return null;
    const amount =
        asNumeric(value["value"]) ??
        [asNumeric(value["minValue"]), asNumeric(value["maxValue"])]
            .filter(Boolean)
            .join("-");
    if (!amount) return null;
    const currency = asString(salary["currency"]);
    const unit = asString(value["unitText"]);
    const period = unit ? (PAY_PERIOD[unit.toUpperCase()] ?? "") : "";
    return [currency, amount].filter(Boolean).join(" ") + period;
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
        return {
            role: asString(posting["title"]),
            company: isObject(org) ? asString(org["name"]) : null,
            location,
            arrangement: readArrangement(posting, location),
            pay: readPay(posting),
            source: "json-ld",
            employerUrl: null,
        };
    }
    return null;
};

// Simplify is an aggregator: its richer Next.js page data takes precedence over
// schema.org and OpenGraph fallbacks when it is present.
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
    const min = asNumeric(posting["min_salary"]);
    const max = asNumeric(posting["max_salary"]);
    const amount = min && max && min !== max ? `${min}-${max}` : (min ?? max);
    if (!amount) return null;
    const period = posting["salary_period"];
    const unit =
        typeof period === "number" ? (SIMPLIFY_PERIOD[period] ?? "") : "";
    return (
        [asString(posting["currency_type"]), amount].filter(Boolean).join(" ") +
        unit
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
        source: "simplify",
        employerUrl: null,
    };
};

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
        source: "opengraph",
        employerUrl: null,
    };
};

export const parsePosting = (html: string): ScrapedPosting =>
    fromSimplify(html) ?? fromJsonLd(html) ?? fromOpenGraph(html);

const titleCase = (slug: string): string =>
    slug
        .replace(/[-_]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");

export const companyFromUrl = (url: URL): string | null => {
    if (url.hostname.endsWith("myworkdayjobs.com")) {
        return titleCase(url.hostname.split(".")[0]);
    }
    if (/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com)$/.test(url.hostname)) {
        const slug = url.pathname.split("/").filter(Boolean)[0];
        return slug ? titleCase(slug) : null;
    }
    return null;
};

export const greenhouseIds = (
    url: URL,
): { slug: string; id: string } | null => {
    if (!/(^|\.)greenhouse\.io$/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts[0];
    const jobsIndex = parts.indexOf("jobs");
    const id =
        jobsIndex >= 0 ? parts[jobsIndex + 1] : url.searchParams.get("gh_jid");
    return slug && id ? { slug, id } : null;
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
        arrangement: arrangementFromText(location),
        pay: null,
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
        posting.pay,
    );

const POSTING_SOURCES = new Set<PostingSource>([
    "json-ld",
    "opengraph",
    "greenhouse",
    "simplify",
    "none",
]);

const nullableString = (value: unknown): value is string | null =>
    value === null || typeof value === "string";

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
        POSTING_SOURCES.has(value["source"] as PostingSource) &&
        nullableString(value["employerUrl"])
    );
};
