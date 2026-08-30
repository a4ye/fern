"use client";

import { useModalDialog } from "@/components/dashboard/use-modal-dialog";

type BrowserKind = "chrome" | "firefox";

const STORE_URLS: Record<BrowserKind, string> = {
    chrome: process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL ?? "",
    firefox: process.env.NEXT_PUBLIC_FIREFOX_EXTENSION_URL ?? "",
};

const BUTTON_CLASS =
    "inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-[background-color,color,scale] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const detectBrowser = (): BrowserKind =>
    navigator.userAgent.includes("Firefox") ? "firefox" : "chrome";

export const ExtensionInstallDialog = ({
    onClose,
}: {
    onClose: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const browser =
        typeof navigator === "undefined" ? "chrome" : detectBrowser();

    const storeUrl = STORE_URLS[browser];
    const installUrl = storeUrl || "/extension";
    const browserLabel = browser === "firefox" ? "Firefox" : "Chrome";

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="extension-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                close(onClose);
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) close(onClose);
            }}
            className="m-auto w-112 max-w-[calc(100vw-2rem)] border-0 bg-background p-0 shadow-lg backdrop:bg-ink/25"
        >
            <div className="h-0.75 bg-accent" aria-hidden="true" />
            <div className="border-x border-b border-hairline px-5 py-5">
                <div className="flex items-start gap-4">
                    <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center bg-accent-tint-soft text-accent-deep"
                    >
                        <span className="icon-[lucide--zap] size-5" />
                    </span>
                    <div className="min-w-0">
                        <h2
                            id="extension-dialog-title"
                            className="text-balance text-base font-semibold text-ink"
                        >
                            Save jobs faster from more sites
                        </h2>
                        <p className="mt-1.5 text-pretty text-sm leading-5 text-sub">
                            Fill application details from more job sites, with
                            less waiting and less manual typing.
                        </p>
                    </div>
                </div>

                <div className="mt-5 space-y-3 border-y border-faint py-4 text-xs text-sub">
                    <p className="flex items-start gap-2.5 text-pretty">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--gauge] mt-0.5 size-4 shrink-0 text-accent-deep"
                        />
                        Import company, role, location, and pay from a wider
                        range of posting links.
                    </p>
                    <p className="flex items-start gap-2.5 text-pretty">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--monitor-down] mt-0.5 size-4 shrink-0 text-accent-deep"
                        />
                        Save postings faster, especially when you are adding
                        several applications.
                    </p>
                    <p className="flex items-start gap-2.5 text-pretty">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--shield-check] mt-0.5 size-4 shrink-0 text-accent-deep"
                        />
                        If a posting needs to be opened first, Job Tracker will
                        always ask before opening it.
                    </p>
                </div>

                <p className="mt-3 text-pretty text-xs text-muted">
                    After installing, refresh Job Tracker once to start using
                    faster imports.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={() => close(onClose)}
                        className={`${BUTTON_CLASS} text-sub hover:bg-surface hover:text-ink`}
                    >
                        Not now
                    </button>
                    <a
                        href={installUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`${BUTTON_CLASS} bg-accent text-background hover:bg-accent-deep`}
                    >
                        <span
                            aria-hidden="true"
                            className={
                                browser === "firefox"
                                    ? "icon-[simple-icons--firefoxbrowser] size-4"
                                    : "icon-[simple-icons--googlechrome] size-4"
                            }
                        />
                        {storeUrl
                            ? `Install for ${browserLabel}`
                            : `Set up for ${browserLabel}`}
                    </a>
                </div>
            </div>
        </dialog>
    );
};
