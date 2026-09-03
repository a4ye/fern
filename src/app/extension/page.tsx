import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
    APP_NAME,
    EXTENSION_DOWNLOAD_PATHS,
    EXTENSION_VERSION,
    type ExtensionBrowser,
} from "@/lib/site";
import { InstallSteps } from "@/components/extension/install-steps";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export const metadata: Metadata = {
    title: "Browser extension",
    description: `Import job postings into ${APP_NAME} from more sites.`,
};

const BENEFITS = [
    "Works on more job sites",
    "Fills in more details",
    "Imports faster",
];

const LABELS: Record<ExtensionBrowser, string> = {
    chrome: "Chrome",
    firefox: "Firefox",
};

const Extension = async () => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });

    const yours: ExtensionBrowser = (
        requestHeaders.get("user-agent") ?? ""
    ).includes("Firefox")
        ? "firefox"
        : "chrome";
    const other: ExtensionBrowser = yours === "firefox" ? "chrome" : "firefox";

    return (
        <main className="flex flex-1 flex-col">
            <SiteHeader signedIn={Boolean(session)} framed={false} />

            <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
                <h1 className="text-3xl font-semibold tracking-tight">
                    Browser extension
                </h1>
                <p className="mt-4 text-base leading-7 text-sub">
                    Paste a job link and {APP_NAME} fills in the details. The
                    extension makes this work on more sites.
                </p>

                <ul className="mt-6 space-y-2">
                    {BENEFITS.map((benefit) => (
                        <li
                            key={benefit}
                            className="flex items-center gap-2.5 text-sm text-sub"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--check] size-4 shrink-0 text-accent"
                            />
                            {benefit}
                        </li>
                    ))}
                </ul>

                <section className="mt-10 border-t border-hairline pt-8">
                    <h2 className="text-base font-semibold">Download</h2>
                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
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
                    <p className="mt-3 text-xs text-muted">
                        Version {EXTENSION_VERSION}, a .zip file. Use the Chrome
                        download for Edge, Brave, Arc, and Opera.
                    </p>
                </section>

                <section className="mt-10 border-t border-hairline pt-8">
                    <h2 className="text-base font-semibold">Install</h2>
                    <div className="mt-4">
                        <InstallSteps initialBrowser={yours} />
                    </div>
                </section>
            </div>

            <SiteFooter />
        </main>
    );
};
export default Extension;
