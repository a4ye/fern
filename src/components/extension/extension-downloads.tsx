"use client";

import { EXTENSION_DOWNLOAD_PATHS, type ExtensionBrowser } from "@/lib/site";
import { useExtensionBrowser } from "@/components/extension/use-extension-browser";

const LABELS: Record<ExtensionBrowser, string> = {
    chrome: "Chrome",
    firefox: "Firefox",
};

export const ExtensionDownloads = () => {
    const yours = useExtensionBrowser();
    const other: ExtensionBrowser = yours === "firefox" ? "chrome" : "firefox";

    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
                href={EXTENSION_DOWNLOAD_PATHS[yours]}
                download
                className="focus-frame inline-flex h-11 items-center gap-2.5 bg-accent px-6 text-sm font-medium text-background transition-colors hover:bg-accent-deep"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--download] size-4"
                />
                Download for {LABELS[yours]}
            </a>
            <a
                href={EXTENSION_DOWNLOAD_PATHS[other]}
                download
                className="text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Download for {LABELS[other]}
            </a>
        </div>
    );
};
