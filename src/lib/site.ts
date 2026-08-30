export const APP_NAME = "Job Tracker";

export const GITHUB_URL = "https://github.com/a4ye/job-tracker";

export const EXTENSION_NAME = "Job Tracker Importer";

export const EXTENSION_VERSION = "0.1.0";

export const EXTENSION_BROWSERS = ["chrome", "firefox"] as const;

export type ExtensionBrowser = (typeof EXTENSION_BROWSERS)[number];

export const EXTENSION_DOWNLOAD_PATHS: Record<ExtensionBrowser, string> = {
    chrome: "/downloads/job-tracker-chrome.zip",
    firefox: "/downloads/job-tracker-firefox.zip",
};

export const LEGAL_EFFECTIVE_DATE = "August 27, 2026";

export const LEGAL_CONTACT_EMAIL =
    process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() ?? "";
