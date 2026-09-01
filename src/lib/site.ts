export const APP_NAME = "Fern";

export const GITHUB_URL = "https://github.com/a4ye/fern";

export const EXTENSION_NAME = "Fern Importer";

export const EXTENSION_VERSION = "0.1.0";

export const EXTENSION_BROWSERS = ["chrome", "firefox"] as const;

export type ExtensionBrowser = (typeof EXTENSION_BROWSERS)[number];

export const EXTENSION_DOWNLOAD_PATHS: Record<ExtensionBrowser, string> = {
    chrome: "/downloads/fern-chrome.zip",
    firefox: "/downloads/fern-firefox.zip",
};

export const LEGAL_EFFECTIVE_DATE = "August 27, 2026";

export const LEGAL_CONTACT_EMAIL =
    process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() ?? "";
