// Server fallback for known job-board providers. Pure extraction lives in the
// shared module so the browser extension and backend produce identical fields.

import {
    EMPTY_POSTING,
    greenhouseIds,
    parseGreenhouseJob,
    parsePosting,
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

const USER_AGENT = "Mozilla/5.0 (compatible; JobTracker/1.0)";
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

// Greenhouse can fall back from its API to the board page, while Simplify also
// resolves its employer link. Budget their worst-case pair of outbound reads.
export const serverImportRequestCost = (rawUrl: string): number => {
    const url = webUrl(rawUrl);
    if (!url) return 1;
    return greenhouseIds(url) ||
        isHostOrSubdomain(url.hostname, "simplify.jobs")
        ? 2
        : 1;
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

const fromGreenhouse = async (
    slug: string,
    id: string,
): Promise<ScrapedPosting | null> => {
    const response = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`,
        {
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
        },
    );
    if (!response.ok) return null;
    return parseGreenhouseJob(await response.json());
};

const simplifyId = (url: URL): string | null => {
    if (!isHostOrSubdomain(url.hostname, "simplify.jobs")) return null;
    const [section, id] = url.pathname.split("/").filter(Boolean);
    return section === "p" && id ? id : null;
};

const cleanReferral = (raw: string): string | null => {
    const url = webUrl(raw);
    if (!url || isHostOrSubdomain(url.hostname, "simplify.jobs")) return null;
    for (const param of [...url.searchParams.keys()]) {
        const normalized = param.toLowerCase();
        if (normalized === "gh_src" || normalized.startsWith("utm_")) {
            url.searchParams.delete(param);
        }
    }
    return url.toString();
};

// Read the employer destination without following it. The destination may be
// arbitrary, but the backend never fetches it.
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

export const scrapePosting = async (
    rawUrl: string,
): Promise<ScrapedPosting> => {
    const url = webUrl(rawUrl);
    if (!url || !serverImportHost(rawUrl)) return EMPTY_POSTING;

    // Resolve the original listing alongside the posting read so Simplify does
    // not add another serial network round trip.
    const simplify = simplifyId(url);
    const employerUrl = simplify ? resolveSimplify(simplify) : null;

    const greenhouse = greenhouseIds(url);
    let result = greenhouse
        ? await fromGreenhouse(greenhouse.slug, greenhouse.id)
        : null;

    if (!result || result.source === "none") {
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
