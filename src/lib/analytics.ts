// Custom events for the Umami tracker that the root layout loads in
// production. Every name and the data it carries are listed here, so a typo at
// a call site is a type error rather than a new event on the dashboard.
//
// No event carries a company, a link, an email, or an ID: the cookie policy
// promises aggregate usage measurements, and that is all these are.

import type { ExtensionBrowser } from "@/lib/site";

export type CtaLocation = "hero" | "header" | "closing" | "footer";

export type AddMethod = "link" | "extension" | "qr" | "manual";

type Events = {
    "cta-click": { location: CtaLocation };
    "sign-in-start": { provider: "github" };
    "sign-up": undefined;
    "extension-download": { browser: ExtensionBrowser };
    "mcp-copy-address": undefined;
    "application-add": { method: AddMethod };
    "import-open": undefined;
    "import-commit": { format: string; rows: number };
    "insights-open": undefined;
    "map-use": undefined;
    "history-open": undefined;
    "share-open": undefined;
    export: { format: "csv" | "xlsx" | "json" | "png" | "svg" };
};

declare global {
    interface Window {
        umami?: { track: (name: string, data?: object) => unknown };
    }
}

// The tracker is absent in development, and until it loads at idle time after
// the page. An event sent before then is dropped rather than queued, which is
// safe only because every call answers a press made on a loaded page.
//
// Links call this from onClick rather than carrying data-umami-event: on a link
// the tracker cancels the click and loads the page in full once the event is
// sent, which would undo client-side navigation. A plain call is sent with
// keepalive, so it survives the navigation that follows.
export const track = <Name extends keyof Events>(
    name: Name,
    ...[data]: Events[Name] extends undefined ? [] : [Events[Name]]
) => {
    window.umami?.track(name, data);
};
