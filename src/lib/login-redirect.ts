// Where a sign-in lands when nothing asked for somewhere else.
export const DEFAULT_AFTER_LOGIN = "/dashboard";

// Any origin will do as long as no real path can resolve onto a different one.
const BASE = "https://fern.invalid";

// The page a sign-in should return to, read from a query anyone can write. Only
// a path on this site is taken. A value that resolves onto another host, such
// as "//evil.test" or "/\evil.test", is dropped, so the login page cannot be
// used to send someone elsewhere with this site's name on the link. The path
// is rebuilt from what the URL parser read, so what is followed is what was
// checked.
export const safeNext = (value: string | string[] | undefined) => {
    if (typeof value !== "string" || !value.startsWith("/")) return null;
    let url: URL;
    try {
        url = new URL(value, BASE);
    } catch {
        return null;
    }
    if (url.origin !== BASE || url.pathname === "/login") return null;
    return `${url.pathname}${url.search}${url.hash}`;
};

// The login page, told to come back to `next` once signed in. The default
// destination needs no saying, so it keeps the plain URL.
export const loginHref = (next: string) =>
    next === DEFAULT_AFTER_LOGIN
        ? "/login"
        : `/login?${new URLSearchParams({ next })}`;
