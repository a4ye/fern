// Extracts application fields from a job posting URL. Greenhouse links use its
// public JSON API; every other host is fetched and parsed for Simplify's page
// data, then schema.org JobPosting JSON-LD, then OpenGraph tags. Company falls
// back to the ATS URL slug. All fields are best-effort suggestions, never
// certain.

import type { Arrangement } from "@/components/dashboard/data";

export type ScrapedPosting = {
    company: string | null;
    role: string | null;
    location: string | null;
    arrangement: Arrangement | null;
    pay: string | null;
    source: "json-ld" | "opengraph" | "greenhouse" | "simplify" | "none";
    // The employer's own posting, where the link given was an aggregator's.
    // Offered to the user rather than swapped in: it is a third party's claim
    // about where the listing came from, and only they can vouch for it.
    employerUrl: string | null;
};

const EMPTY: ScrapedPosting = {
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
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
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

// Remote is explicit in schema.org; hybrid and onsite only ever show up in the
// location text, so they are read from there.
const REMOTE_TEXT = /\bremote\b/i;
const HYBRID_TEXT = /\bhybrid\b/i;
const ONSITE_TEXT = /\bon-?site\b|\bin[-\s]office\b/i;

const readArrangement = (
    posting: JsonObject,
    location: string | null,
): Arrangement | null => {
    const type = asString(posting["jobLocationType"]);
    if (type && type.toUpperCase() === "TELECOMMUTE") return "remote";
    return arrangementFromText(location);
};

export const arrangementFromText = (
    value: string | null,
): Arrangement | null => {
    if (!value) return null;
    if (HYBRID_TEXT.test(value)) return "hybrid";
    if (REMOTE_TEXT.test(value)) return "remote";
    if (ONSITE_TEXT.test(value)) return "onsite";
    return null;
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

// Simplify is an aggregator: it reposts other boards' listings behind its own
// page, which carries the whole posting as Next.js page data. That is richer
// and cleaner than the JSON-LD it sometimes also emits, and it is there on the
// postings that emit none, so it is read first.
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

// Confirmed against live postings: 1 pays hourly and 4 pays yearly. The codes
// between are left unlabelled rather than guessed, so the amount reaches the
// user without a period instead of with the wrong one.
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

// Attributes are read out of the tag separately because Next.js emits `content`
// before `property`, and a single pattern would have to fix one order or other.
const metaContent = (html: string, property: string): string | null => {
    for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
        const key = tag.match(/(?:property|name)=["']([^"']*)["']/i)?.[1];
        if (key?.toLowerCase() !== property) continue;
        return asString(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null);
    }
    return null;
};

// Simplify reposts other boards' listings and packs both fields into the one
// title. Its og:site_name is the aggregator, so the company has to come from
// here or the employer would be recorded as "Simplify Jobs".
const SIMPLIFY_TITLE = /^(.*) @ (.*) \| Simplify$/;

const fromOpenGraph = (html: string): ScrapedPosting => {
    const title = metaContent(html, "og:title");
    const site = metaContent(html, "og:site_name");
    if (!title && !site) return EMPTY;
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

// The company handle lives in the URL for every hosted ATS: the first path
// segment on Lever/Ashby/Greenhouse, the subdomain on Workday.
const companyFromUrl = (url: URL): string | null => {
    if (url.hostname.endsWith("myworkdayjobs.com")) {
        return titleCase(url.hostname.split(".")[0]);
    }
    if (/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com)$/.test(url.hostname)) {
        const slug = url.pathname.split("/").filter(Boolean)[0];
        return slug ? titleCase(slug) : null;
    }
    return null;
};

const greenhouseIds = (url: URL): { slug: string; id: string } | null => {
    if (!/(^|\.)greenhouse\.io$/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts[0];
    const jobsIndex = parts.indexOf("jobs");
    const id =
        jobsIndex >= 0 ? parts[jobsIndex + 1] : url.searchParams.get("gh_jid");
    return slug && id ? { slug, id } : null;
};

const fromGreenhouse = async (
    slug: string,
    id: string,
): Promise<ScrapedPosting | null> => {
    const response = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`,
        { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const job = (await response.json()) as JsonObject;
    const node = job["location"];
    const location = isObject(node) ? asString(node["name"]) : null;
    return {
        role: asString(job["title"]),
        company: asString(job["company_name"]),
        location,
        arrangement: arrangementFromText(location),
        pay: null,
        source: "greenhouse",
        employerUrl: null,
    };
};

const USER_AGENT = "Mozilla/5.0 (compatible; JobTracker/1.0)";

// The posting id in a /p/<uuid>/<slug> link, which is also the id its click
// endpoint answers to.
const simplifyId = (url: URL): string | null => {
    if (!/(^|\.)simplify\.jobs$/.test(url.hostname)) return null;
    const [section, id] = url.pathname.split("/").filter(Boolean);
    return section === "p" && id ? id : null;
};

// Marks the aggregator stamps on the link it hands back, so the employer's own
// address is stored rather than one crediting the referral.
// The address comes from a third party and ends up in an href, so a non-web
// scheme is dropped here rather than offered.
const cleanReferral = (raw: string): string | null => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (/(^|\.)simplify\.jobs$/.test(url.hostname)) return null;
    for (const param of [...url.searchParams.keys()]) {
        const normalized = param.toLowerCase();
        if (normalized === "gh_src" || normalized.startsWith("utm_"))
            url.searchParams.delete(param);
    }
    return url.toString();
};

// Asks where the listing was reposted from without following the answer: a
// posting that has since closed redirects on to a careers index, which loses
// the job the hop was meant to find.
const resolveSimplify = async (id: string): Promise<string | null> => {
    try {
        const response = await fetch(`https://simplify.jobs/jobs/click/${id}`, {
            redirect: "manual",
            headers: { "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(8000),
        });
        if (response.status < 300 || response.status >= 400) return null;
        const location = response.headers.get("location");
        return location ? cleanReferral(location) : null;
    } catch {
        // Nothing to offer, so the link the user pasted stands as it is.
        return null;
    }
};

export const scrapePosting = async (
    rawUrl: string,
): Promise<ScrapedPosting> => {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return EMPTY;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return EMPTY;

    // Started before the page is read so the two reads overlap; it resolves to
    // null rather than rejecting, so it is safe to leave running.
    const simplify = simplifyId(url);
    const employerUrl = simplify ? resolveSimplify(simplify) : null;

    const greenhouse = greenhouseIds(url);
    let result = greenhouse
        ? await fromGreenhouse(greenhouse.slug, greenhouse.id)
        : null;

    // Non-Greenhouse hosts, or a Greenhouse API miss, fall back to page parsing.
    // A network/parse failure here degrades to empty fields the user fills in.
    if (!result || result.source === "none") {
        try {
            const response = await fetch(rawUrl, {
                headers: { "user-agent": USER_AGENT },
                signal: AbortSignal.timeout(8000),
            });
            result = response.ok ? parsePosting(await response.text()) : EMPTY;
        } catch {
            result = EMPTY;
        }
    }

    // Fill a missing company from the URL slug (fixes Greenhouse page fallback).
    return {
        ...result,
        company: result.company ?? companyFromUrl(url),
        employerUrl: employerUrl ? await employerUrl : null,
    };
};
