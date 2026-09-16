// A share link's address is the whole of its authorisation: anyone holding it
// can read the list, and nobody is asked to sign in. Everything here is about
// keeping that address hard to arrive at by any route other than being sent it.

// 32 bytes from the platform's cryptographic source, written in the alphabet a
// URL carries unescaped. Nothing about the list, the owner or the time is in
// it, so one token says nothing about another and none of them can be worked
// out from what a person already knows.
export const SHARE_TOKEN_BYTES = 32;

export const newShareToken = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(SHARE_TOKEN_BYTES));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
};

// Base64url of 32 bytes is 43 characters. Anything else never reached this app
// as a link it made, so it is turned away before it becomes a database read.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const isShareToken = (token: string): boolean =>
    TOKEN_PATTERN.test(token);

export const sharePath = (token: string): string => `/s/${token}`;

// How long a new link lasts, offered as a short list rather than a date field:
// these are the answers people actually want, and picking one is a press rather
// than a calendar. "Never" is first because it is the common case, a list sent
// to a friend with no reason to stop working.
// Labels read after the word "Expires", on the button and in the menu both, so
// "Expires never" and "Expires in 3 days" are whole sentences either way.
export const LINK_DURATIONS = [
    { value: "never", label: "never", hours: null },
    { value: "24h", label: "in 24 hours", hours: 24 },
    { value: "3d", label: "in 3 days", hours: 24 * 3 },
    { value: "7d", label: "in 7 days", hours: 24 * 7 },
    { value: "30d", label: "in 30 days", hours: 24 * 30 },
] as const;

export type LinkDuration = (typeof LINK_DURATIONS)[number]["value"];

export const LINK_DURATION_VALUES = LINK_DURATIONS.map(
    (duration) => duration.value,
) as unknown as [LinkDuration, ...LinkDuration[]];

export const expiryFrom = (duration: LinkDuration): Date | null => {
    const hours = LINK_DURATIONS.find(
        (option) => option.value === duration,
    )?.hours;
    return hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;
};

// What the dialog prints beside a link. A link that has lapsed or been revoked
// keeps its row so the owner can see why somebody they sent it to can no longer
// open it, which is the question a missing row would leave them with.
export type LinkState = "active" | "expired" | "revoked";

export const linkState = (link: {
    expiresAt: string | null;
    revokedAt: string | null;
}): LinkState => {
    if (link.revokedAt) return "revoked";
    if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) {
        return "expired";
    }
    return "active";
};
