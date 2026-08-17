// A job link copied out of a search page, an email, or a referral post carries
// the campaign it was served by. None of it identifies the posting, and it
// survives into the row, the export, and any link shared from it. Only names
// that are tracking wherever they appear are listed globally; anything a site
// could plausibly route on is listed against that site instead.

const TRACKING_PREFIXES = [
    "utm_",
    "pk_",
    "mtm_",
    "matomo_",
    "hsa_",
    "vero_",
    "oly_",
    "_hs",
];

const TRACKING_PARAMS = new Set([
    // Ad click identifiers.
    "gclid",
    "gclsrc",
    "gad_source",
    "gbraid",
    "wbraid",
    "dclid",
    "srsltid",
    "msclkid",
    "fbclid",
    "twclid",
    "ttclid",
    "yclid",
    "epik",
    "rdt_cid",
    "li_fat_id",
    "igshid",
    "igsh",
    "s_kwcid",
    "ef_id",
    // Email campaign identifiers.
    "mkt_tok",
    "mc_cid",
    "mc_eid",
    // Applicant tracking systems. A board is as often embedded on the
    // employer's own domain as served from the vendor's, so these are matched
    // everywhere. Each name belongs to one vendor and means nothing elsewhere.
    "gh_src",
    "lever-source",
    "lever-origin",
    "lever-via",
    "zrclid",
]);

// Keyed by registrable domain, matched against the host and its subdomains.
const HOST_PARAMS: Record<string, string[]> = {
    "linkedin.com": [
        "trk",
        "trkInfo",
        "refId",
        "trackingId",
        "originTrackingId",
        "alternateChannel",
        "savedSearchId",
        "originalSubdomain",
        "original_referer",
        "lipi",
        "licu",
        "midToken",
        "midSig",
        "eBP",
        "position",
        "pageNum",
    ],
    "indeed.com": [
        "from",
        "tk",
        "vjs",
        "advn",
        "alid",
        "acatk",
        "sjdu",
        "xkcb",
        "xpse",
        "xfps",
    ],
    "glassdoor.com": ["src", "srs", "jrtk", "cpt", "ao", "s"],
    "ziprecruiter.com": ["tsid", "lvk"],
    "monster.com": ["so", "mescoid"],
    "dice.com": ["src", "searchlink"],
    "myworkdayjobs.com": ["source"],
    "smartrecruiters.com": ["trid"],
    "workable.com": ["ref"],
    "simplify.jobs": ["utm_source"],
};

const hostParams = (hostname: string): string[] => {
    const host = hostname.toLowerCase();
    for (const [domain, params] of Object.entries(HOST_PARAMS)) {
        if (host === domain || host.endsWith(`.${domain}`)) return params;
    }
    return [];
};

const isTracking = (name: string, scoped: string[]): boolean => {
    const key = name.toLowerCase();
    return (
        TRACKING_PARAMS.has(key) ||
        TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
        scoped.some((param) => param.toLowerCase() === key)
    );
};

// Anything that does not parse as a web link is handed back untouched: it is
// text the user typed, and rewriting it would be a worse guess than leaving it.
export const cleanLink = (raw: string): string => {
    const trimmed = raw.trim();
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return trimmed;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return trimmed;

    const scoped = hostParams(url.hostname);
    const drop = [...url.searchParams.keys()].filter((name) =>
        isTracking(name, scoped),
    );
    if (drop.length === 0) return trimmed;

    for (const name of drop) url.searchParams.delete(name);
    // An emptied query still prints its `?`, which reads like the link was cut
    // short.
    if (![...url.searchParams.keys()].length) url.search = "";
    return url.toString();
};
