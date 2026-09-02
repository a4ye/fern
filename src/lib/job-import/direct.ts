// Reading a posting from the provider's own API, in the browser that pasted the
// link. Every provider here answers cross-origin, so this costs the app nothing
// at all: no server, no shared budget, and the request comes from the reader's
// own connection, which is how these boards are meant to be read anyway. It
// works on a phone, where there is no extension to fall back to.
//
// What keeps a provider out of here is the browser being unable to read it at
// all, not the size of the answer. Ashby publishes a whole board at a time,
// measured at 437 KB to 2.2 MB across real companies, and that is worth one
// download: the boards below are remembered for the life of the page, so adding
// a second job from the same company costs nothing.
//
// Workday cannot be here. Its pages and its own JSON API both answer without a
// cross-origin header, checked against three tenants, so a browser is refused
// even though the data is plainly there. It stays with the extension and the
// server, as does Simplify, which serves its posting pages without that header
// too.

import {
    arrangementFromText,
    companyFromUrl,
    greenhouseIds,
    parseGreenhouseJob,
    parseRipplingJob,
    payText,
    type JobArrangement,
    type ScrapedPosting,
} from "@/lib/job-import/shared";

// Long enough for a slow phone connection, short enough that the extension and
// then the server still get their turn before anyone has finished typing.
const TIMEOUT_MS = 6000;

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

const number = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

// Each board spells the interval its own way, so each reduces it to the unit
// word before looking it up here. A unit with no pay_period column of its own is
// left off rather than rounded into a neighbouring one.
const PERIOD_SUFFIX: Record<string, string> = {
    hour: "/hr",
    week: "/wk",
    month: "/mo",
    year: "/yr",
};

const webUrl = (rawUrl: string): URL | null => {
    try {
        const url = new URL(rawUrl);
        return url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
};

const isHostOrSubdomain = (hostname: string, domain: string): boolean =>
    hostname === domain || hostname.endsWith(`.${domain}`);

// Lever names the arrangement outright, which is better than the guess a scraped
// page leaves us making from the location text.
const LEVER_WORKPLACE: Record<string, JobArrangement> = {
    remote: "remote",
    hybrid: "hybrid",
    "on-site": "onsite",
    onsite: "onsite",
};

const leverIds = (url: URL): { company: string; id: string } | null => {
    if (!isHostOrSubdomain(url.hostname, "lever.co")) return null;
    const [company, id] = url.pathname.split("/").filter(Boolean);
    return company && id ? { company, id } : null;
};

// Lever names the interval in full, as "per-year-salary" or "per-hour-wage",
// where the middle word is the only part that says anything.
const leverPeriod = (interval: string | null): string => {
    const unit = interval?.match(/^per-(\w+)-/i)?.[1];
    return unit ? (PERIOD_SUFFIX[unit.toLowerCase()] ?? "") : "";
};

const leverPay = (value: Record<string, unknown>): string | null => {
    const range = value["salaryRange"];
    if (!isObject(range)) return null;
    return payText(
        number(range["min"]),
        number(range["max"]),
        text(range["currency"]),
        leverPeriod(text(range["interval"])),
    );
};

const parseLeverPosting = (value: unknown, url: URL): ScrapedPosting | null => {
    if (!isObject(value)) return null;
    const role = text(value["text"]);
    if (!role) return null;

    const categories = isObject(value["categories"]) ? value["categories"] : {};
    const location = text(categories["location"]);
    const workplace = text(value["workplaceType"])?.toLowerCase() ?? "";

    return {
        // The payload names the job but not the employer, so the board it came
        // from does: the slug in the link is the company's own.
        company: companyFromUrl(url),
        role,
        location,
        arrangement:
            LEVER_WORKPLACE[workplace] ?? arrangementFromText(location),
        // Only the boards that have turned pay transparency on carry a range,
        // and null on the rest means the same as it always did.
        pay: leverPay(value),
        payNote: null,
        source: "lever",
        employerUrl: null,
    };
};

const ASHBY_WORKPLACE: Record<string, JobArrangement> = {
    remote: "remote",
    hybrid: "hybrid",
    onsite: "onsite",
};

const ashbyIds = (url: URL): { org: string; id: string } | null => {
    if (!isHostOrSubdomain(url.hostname, "ashbyhq.com")) return null;
    const [org, id] = url.pathname.split("/").filter(Boolean);
    return org && id ? { org, id } : null;
};

// Ashby writes an interval as "1 YEAR" or "1 HOUR", and as "NONE" where the
// component is not paid on a clock at all.
const ashbyPeriod = (interval: string | null): string => {
    const unit = interval?.match(/^1\s+(\w+)$/i)?.[1];
    return unit ? (PERIOD_SUFFIX[unit.toLowerCase()] ?? "") : "";
};

// Both kinds of equity say the same thing to someone reading a pay column: the
// offer includes stock. Which of the two it is describes how Ashby measured it,
// not what is on offer.
const ASHBY_COMPONENT: Record<string, string> = {
    EquityCashValue: "Equity",
    EquityPercentage: "Equity",
    Bonus: "Bonus",
    Commission: "Commission",
};

// Ashby lists the components in no order it holds to, so the note is written in
// this one instead and two postings offering the same things read alike.
const NOTE_ORDER = ["Equity", "Bonus", "Commission"];

const ashbyAmount = (component: Record<string, unknown>): string | null =>
    payText(
        number(component["minValue"]),
        number(component["maxValue"]),
        text(component["currencyCode"]),
        ashbyPeriod(text(component["interval"])),
    );

// `summaryComponents` is the whole offer broken out, already merged across the
// per-location tiers. It is read instead of `compensationTierSummary` because it
// is the numbers themselves: the summary is display text, which spells the
// currency as a glyph and joins a range with an en dash, so reading it back is a
// guess where this is a fact.
const ashbyCompensation = (
    job: Record<string, unknown>,
): { pay: string | null; payNote: string | null } => {
    const compensation = isObject(job["compensation"])
        ? job["compensation"]
        : {};
    const components = compensation["summaryComponents"];
    if (!Array.isArray(components)) return { pay: null, payNote: null };

    let pay: string | null = null;
    const extras = new Map<string, string>();
    for (const component of components) {
        if (!isObject(component)) continue;
        const kind = text(component["compensationType"]);
        if (kind === "Salary") {
            pay ??= ashbyAmount(component);
            continue;
        }
        // Ashby states equity and a bonus as a fact far more often than as an
        // amount, so the label is what carries over, with a range beside it
        // wherever there is one to give.
        const label = kind ? ASHBY_COMPONENT[kind] : undefined;
        if (!label || extras.has(label)) continue;
        const amount = ashbyAmount(component);
        extras.set(label, amount ? `${label} ${amount}` : label);
    }

    const note = NOTE_ORDER.filter((label) => extras.has(label))
        .map((label) => extras.get(label))
        .join(", ");
    return { pay, payNote: note || null };
};

const parseAshbyBoard = (value: unknown, url: URL): ScrapedPosting | null => {
    const ids = ashbyIds(url);
    if (!ids || !isObject(value) || !Array.isArray(value["jobs"])) return null;

    const job = value["jobs"].find(
        (entry) => isObject(entry) && entry["id"] === ids.id,
    );
    if (!isObject(job)) return null;

    const role = text(job["title"]);
    if (!role) return null;

    const location = text(job["location"]);
    const workplace = text(job["workplaceType"])?.toLowerCase() ?? "";
    const { pay, payNote } = ashbyCompensation(job);

    return {
        company: companyFromUrl(url),
        role,
        location,
        arrangement:
            ASHBY_WORKPLACE[workplace] ??
            (job["isRemote"] === true
                ? "remote"
                : arrangementFromText(location)),
        pay,
        payNote,
        source: "ashby",
        employerUrl: null,
    };
};

const ripplingIds = (url: URL): { slug: string; id: string } | null => {
    if (!isHostOrSubdomain(url.hostname, "rippling.com")) return null;
    const [slug, section, id] = url.pathname.split("/").filter(Boolean);
    return slug && section === "jobs" && id ? { slug, id } : null;
};

// Where a pasted link can be read directly, and what to do with the answer.
const readers: {
    apiUrl: (url: URL) => string | null;
    parse: (value: unknown, url: URL) => ScrapedPosting | null;
}[] = [
    {
        apiUrl: (url) => {
            const ids = greenhouseIds(url);
            // Greenhouse leaves the pay ranges out of the answer unless they
            // are asked for by name, so a posting that publishes one still
            // reads as a posting with no pay at all without this.
            return ids
                ? `https://boards-api.greenhouse.io/v1/boards/${ids.slug}/jobs/${ids.id}?pay_transparency=true`
                : null;
        },
        parse: parseGreenhouseJob,
    },
    {
        apiUrl: (url) => {
            const ids = leverIds(url);
            return ids
                ? `https://api.lever.co/v0/postings/${ids.company}/${ids.id}`
                : null;
        },
        parse: parseLeverPosting,
    },
    {
        apiUrl: (url) => {
            const ids = ashbyIds(url);
            return ids
                ? `https://api.ashbyhq.com/posting-api/job-board/${ids.org}?includeCompensation=true`
                : null;
        },
        parse: parseAshbyBoard,
    },
    {
        apiUrl: (url) => {
            const ids = ripplingIds(url);
            return ids
                ? `https://api.rippling.com/platform/api/ats/v1/board/${ids.slug}/jobs/${ids.id}`
                : null;
        },
        parse: parseRipplingJob,
    },
];

// Whether this link is one the browser can read on its own, which is what the
// form checks before deciding it needs the extension or the server.
export const isDirectlyReadable = (rawUrl: string): boolean => {
    const url = webUrl(rawUrl);
    return (
        url !== null && readers.some((reader) => reader.apiUrl(url) !== null)
    );
};

// Answers already given, so that a board fetched to read one posting can answer
// for the next one from the same company without being fetched again. Held for
// the life of the page: a posting does not change while a form is open, and the
// few boards someone works through in one sitting are worth keeping.
//
// The promise is stored rather than the result, so two pastes in the same moment
// share one request instead of racing to make two.
const MAX_REMEMBERED = 8;
const answers = new Map<string, Promise<unknown>>();

const readJson = (apiUrl: string): Promise<unknown> => {
    const remembered = answers.get(apiUrl);
    if (remembered) return remembered;

    const answer = fetch(apiUrl, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
    });

    // A failure is worth retrying, so it is not what gets remembered.
    void answer.catch(() => answers.delete(apiUrl));

    answers.set(apiUrl, answer);
    if (answers.size > MAX_REMEMBERED) {
        const oldest = answers.keys().next().value;
        if (oldest !== undefined) answers.delete(oldest);
    }
    return answer;
};

// Null for anything this cannot read, whatever the reason: an unknown provider,
// a posting that has been taken down, a blocked request, a network that gave up.
// Every one of them means the same thing to the caller, which is to try the next
// way of reading it.
export const importDirect = async (
    rawUrl: string,
): Promise<ScrapedPosting | null> => {
    const url = webUrl(rawUrl);
    if (!url) return null;

    for (const reader of readers) {
        const apiUrl = reader.apiUrl(url);
        if (!apiUrl) continue;
        try {
            return reader.parse(await readJson(apiUrl), url);
        } catch {
            return null;
        }
    }
    return null;
};
