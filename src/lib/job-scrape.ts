// Server fallback for known job-board providers. Pure extraction lives in the
// shared module so the browser extension and backend produce identical fields.

import {
    EMPTY_POSTING,
    employerLink,
    greenhouseIds,
    parseGreenhouseJob,
    parsePosting,
    simplifyClickUrl,
    withUrlFallback,
    type ScrapedPosting,
} from "@/lib/job-import/shared";
import { readPostingHtml } from "@/lib/job-import/response";

export {
    EMPTY_POSTING,
    arrangementFromText,
    parsePosting,
    type ScrapedPosting,
} from "@/lib/job-import/shared";

const USER_AGENT = "Mozilla/5.0 (compatible; Fern/1.0)";
const SERVER_ATS_HOSTS = [
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "myworkdayjobs.com",
    "simplify.jobs",
] as const;

const isHostOrSubdomain = (hostname: string, domain: string): boolean =>
    hostname === domain || hostname.endsWith(`.${domain}`);

const webUrl = (rawUrl: string): URL | null => {
    try {
        const url = new URL(rawUrl);
        if (url.username || url.password) return null;
        return url.protocol === "http:" || url.protocol === "https:"
            ? url
            : null;
    } catch {
        return null;
    }
};

// The backend deliberately knows only about providers we have adapters or
// fixtures for. Arbitrary employer sites belong to the browser extension.
export const serverImportHost = (rawUrl: string): string | null => {
    const url = webUrl(rawUrl);
    if (!url) return null;
    const supported = SERVER_ATS_HOSTS.some((domain) =>
        isHostOrSubdomain(url.hostname, domain),
    );
    if (!supported) return null;
    return greenhouseIds(url) ? "boards-api.greenhouse.io" : url.hostname;
};

// What a read is certain to spend. Simplify always makes two, since it resolves
// the employer link alongside the posting. Greenhouse usually makes one: its API
// answers most links on its own, and the board page behind it is only read when
// that comes back empty, which is charged for at the point it happens rather
// than reserved from everyone in advance.
export const serverImportRequestCost = (rawUrl: string): number => {
    const url = webUrl(rawUrl);
    if (!url) return 1;
    return isHostOrSubdomain(url.hostname, "simplify.jobs") ? 2 : 1;
};

// Tracking parameters do not change a posting and would otherwise fragment the
// shared cache into one entry per referral link.
export const normalizeImportUrl = (rawUrl: string): string | null => {
    const url = webUrl(rawUrl);
    if (!url) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
        const normalized = key.toLowerCase();
        if (normalized === "gh_src" || normalized.startsWith("utm_")) {
            url.searchParams.delete(key);
        }
    }
    url.searchParams.sort();
    return url.toString();
};

// A provider saying no, as opposed to saying nothing useful. The difference
// decides whether it is reasonable to ask it a second time.
const TURNED_AWAY = [429, 403] as const;

export const isTurnedAway = (status: number): boolean =>
    (TURNED_AWAY as readonly number[]).includes(status);

type ProviderRead = ScrapedPosting | null | "turned-away";

const fromGreenhouse = async (
    slug: string,
    id: string,
): Promise<ProviderRead> => {
    const response = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`,
        {
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
        },
    );
    if (isTurnedAway(response.status)) return "turned-away";
    if (!response.ok) return null;
    return parseGreenhouseJob(await response.json());
};

// Read the employer destination without following it. The destination may be
// arbitrary, but the backend never fetches it.
const resolveSimplify = async (clickUrl: string): Promise<string | null> => {
    try {
        const response = await fetch(clickUrl, {
            redirect: "manual",
            headers: { "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(8000),
        });
        if (response.status < 300 || response.status >= 400) return null;
        const location = response.headers.get("location");
        return location ? employerLink(location) : null;
    } catch {
        return null;
    }
};

// Redirects are followed explicitly so a supported provider cannot bounce the
// server into fetching an arbitrary or private destination.
const fetchKnownPage = async (initial: URL): Promise<Response | null> => {
    let current = initial;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await fetch(current, {
            redirect: "manual",
            headers: { "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(8000),
        });
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get("location");
        if (!location) return null;
        const next = new URL(location, current);
        if (!serverImportHost(next.toString())) return null;
        current = next;
    }
    return null;
};

// Reading the board page after the API came back empty is a second request to
// the same provider, so it is paid for separately. Left out, nothing is charged
// and the fallback simply runs, which is what the tests want.
export type SpendAnotherRead = () => Promise<boolean>;

export const scrapePosting = async (
    rawUrl: string,
    spendAnotherRead?: SpendAnotherRead,
): Promise<ScrapedPosting> => {
    const url = webUrl(rawUrl);
    if (!url || !serverImportHost(rawUrl)) return EMPTY_POSTING;

    // Resolve the original listing alongside the posting read so Simplify does
    // not add another serial network round trip.
    const clickUrl = simplifyClickUrl(url);
    const employerUrl = clickUrl ? resolveSimplify(clickUrl) : null;

    const greenhouse = greenhouseIds(url);
    const api = greenhouse
        ? await fromGreenhouse(greenhouse.slug, greenhouse.id)
        : null;

    // A provider that has just refused us is the last one to ask again. Falling
    // through to the board page here would be a second request inside the same
    // refusal, which is how a moment's throttling turns into being blocked, and
    // being blocked takes the feature away from everyone at once. The caller
    // gets nothing, which is what it already shows when a link cannot be read.
    const turnedAway = api === "turned-away";
    let result: ScrapedPosting =
        api === "turned-away" || api === null ? EMPTY_POSTING : api;

    const canRead =
        !turnedAway &&
        result.source === "none" &&
        (!spendAnotherRead || (await spendAnotherRead()));

    if (canRead) {
        try {
            const response = await fetchKnownPage(url);
            const html =
                response?.ok === true ? await readPostingHtml(response) : null;
            result = html ? parsePosting(html) : EMPTY_POSTING;
        } catch {
            result = EMPTY_POSTING;
        }
    }

    return {
        ...withUrlFallback(result, url),
        employerUrl: employerUrl ? await employerUrl : null,
    };
};
