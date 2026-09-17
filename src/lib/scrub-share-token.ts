import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// A share link's address is the whole of its authorisation, and it travels in
// the path. Anything that records a URL therefore records a live credential, so
// error reporting is treated as a place the token must not reach: an exception
// raised while drawing a shared list would otherwise put a working link into a
// third-party service, where it outlives the request and is readable by anyone
// with access to the issues.
//
// The header and the referrer are already handled on the page itself. This is
// the other channel.
const SHARE_PATH = /\/s\/[A-Za-z0-9_-]{43}/g;

const REDACTED = "/s/[token]";

const scrub = (value: string): string => value.replace(SHARE_PATH, REDACTED);

// Sentry sends the same address in several shapes: the request URL, the name of
// the transaction, and every breadcrumb that recorded a navigation. Stack frame
// variables are swept too. No runtime is configured to capture them now, and
// this stays because the cost of sweeping an empty frame is nothing and the
// cost of turning capture back on without it is a live link in an issue.
export const scrubShareToken = (
    event: ErrorEvent,
    _hint?: EventHint,
): ErrorEvent => {
    if (event.request?.url) event.request.url = scrub(event.request.url);
    if (event.transaction) event.transaction = scrub(event.transaction);

    for (const breadcrumb of event.breadcrumbs ?? []) {
        if (typeof breadcrumb.message === "string") {
            breadcrumb.message = scrub(breadcrumb.message);
        }
        const data = breadcrumb.data;
        if (!data) continue;
        for (const key of ["url", "from", "to"]) {
            if (typeof data[key] === "string") data[key] = scrub(data[key]);
        }
    }

    for (const value of event.exception?.values ?? []) {
        for (const frame of value.stacktrace?.frames ?? []) {
            const locals = frame.vars;
            if (!locals) continue;
            for (const [name, held] of Object.entries(locals)) {
                if (typeof held === "string") locals[name] = scrub(held);
            }
            // The token also arrives on its own, not inside a path, since it is
            // what the route segment binds. Nothing else in this app is 43
            // base64url characters, so the binding is dropped by name.
            if ("token" in locals) locals.token = REDACTED;
        }
    }

    return event;
};
