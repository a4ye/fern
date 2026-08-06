// Extracts application fields from a job posting URL. Greenhouse links use its
// public JSON API; every other host is fetched and parsed for schema.org
// JobPosting JSON-LD, then OpenGraph tags. Company falls back to the ATS URL
// slug. All fields are best-effort suggestions, never certain.

import type { Arrangement } from "@/components/dashboard/data";

export type ScrapedPosting = {
    company: string | null;
    role: string | null;
    location: string | null;
    arrangement: Arrangement | null;
    pay: string | null;
    source: "json-ld" | "opengraph" | "greenhouse" | "none";
};

const EMPTY: ScrapedPosting = {
    company: null,
    role: null,
    location: null,
    arrangement: null,
    pay: null,
    source: "none",
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
        };
    }
    return null;
};

const metaContent = (html: string, property: string): string | null => {
    const pattern = new RegExp(
        `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
        "i",
    );
    return asString(html.match(pattern)?.[1] ?? null);
};

const fromOpenGraph = (html: string): ScrapedPosting => {
    const title = metaContent(html, "og:title");
    const site = metaContent(html, "og:site_name");
    if (!title && !site) return EMPTY;
    return {
        role: title,
        company: site,
        location: null,
        arrangement: arrangementFromText(title),
        pay: null,
        source: "opengraph",
    };
};

export const parsePosting = (html: string): ScrapedPosting =>
    fromJsonLd(html) ?? fromOpenGraph(html);

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
    };
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

    const greenhouse = greenhouseIds(url);
    let result = greenhouse
        ? await fromGreenhouse(greenhouse.slug, greenhouse.id)
        : null;

    // Non-Greenhouse hosts, or a Greenhouse API miss, fall back to page parsing.
    // A network/parse failure here degrades to empty fields the user fills in.
    if (!result || result.source === "none") {
        const response = await fetch(rawUrl, {
            headers: {
                "user-agent": "Mozilla/5.0 (compatible; JobTracker/1.0)",
            },
            signal: AbortSignal.timeout(8000),
        });
        result = response.ok ? parsePosting(await response.text()) : EMPTY;
    }

    // Fill a missing company from the URL slug (fixes Greenhouse page fallback).
    return result.company
        ? result
        : { ...result, company: companyFromUrl(url) };
};
