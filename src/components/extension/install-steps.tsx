"use client";

import { useEffect, useState } from "react";
import {
    APP_NAME,
    EXTENSION_BROWSERS,
    type ExtensionBrowser,
} from "@/lib/site";

type Step = { text: string; address?: string };

const BROWSERS: Record<
    ExtensionBrowser,
    { label: string; icon: string; note: string; steps: Step[] }
> = {
    chrome: {
        label: "Chrome",
        icon: "icon-[simple-icons--googlechrome]",
        note: "Do not move or delete the folder after installing.",
        steps: [
            { text: "Unzip the file you downloaded." },
            {
                text: "Open this address and turn on Developer mode.",
                address: "chrome://extensions",
            },
            { text: "Click Load unpacked and select the unzipped folder." },
            { text: `Refresh ${APP_NAME}.` },
        ],
    },
    firefox: {
        label: "Firefox",
        icon: "icon-[simple-icons--firefoxbrowser]",
        note: "Firefox removes the add-on when you close it. Load it again next time.",
        steps: [
            {
                text: "Open this address and click This Firefox.",
                address: "about:debugging",
            },
            {
                text: "Click Load Temporary Add-on and select the file you downloaded.",
            },
            { text: `Refresh ${APP_NAME}.` },
        ],
    },
};

const CopyAddress = ({ address }: { address: string }) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1600);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <div className="mt-2 flex h-9 w-full max-w-xs items-center border border-hairline bg-surface">
            <span className="min-w-0 flex-1 truncate px-2.5 text-sm text-ink">
                {address}
            </span>
            <button
                type="button"
                aria-label={`Copy ${address}`}
                onClick={() =>
                    navigator.clipboard
                        .writeText(address)
                        .then(() => setCopied(true))
                }
                className="focus-frame flex size-9 shrink-0 cursor-pointer items-center justify-center border-l border-hairline text-sub transition-colors hover:bg-accent-tint-soft hover:text-ink"
            >
                <span
                    aria-hidden="true"
                    className={
                        copied
                            ? "icon-[lucide--check] size-3.5 text-accent-deep"
                            : "icon-[lucide--copy] size-3.5"
                    }
                />
            </button>
        </div>
    );
};

export const InstallSteps = ({
    initialBrowser,
}: {
    initialBrowser: ExtensionBrowser;
}) => {
    const [selected, setSelected] = useState(initialBrowser);

    return (
        <div>
            <div
                role="group"
                aria-label="Browser"
                className="inline-flex border border-hairline"
            >
                {EXTENSION_BROWSERS.map((name) => {
                    const active = name === selected;
                    return (
                        <button
                            key={name}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelected(name)}
                            className={`focus-frame inline-flex h-9 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-colors not-first:border-l not-first:border-hairline ${
                                active
                                    ? "bg-accent text-background"
                                    : "text-sub hover:bg-surface hover:text-ink"
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`${BROWSERS[name].icon} size-4`}
                            />
                            {BROWSERS[name].label}
                        </button>
                    );
                })}
            </div>

            {/* Both browsers stay mounted in one grid cell so the taller set of
                steps sets the height and switching does not move the page. */}
            <div className="mt-6 grid">
                {EXTENSION_BROWSERS.map((name) => {
                    const active = name === selected;
                    return (
                        <div
                            key={name}
                            inert={!active}
                            className={`col-start-1 row-start-1 ${active ? "" : "invisible"}`}
                        >
                            <ol className="space-y-4">
                                {BROWSERS[name].steps.map((step, index) => (
                                    <li
                                        key={step.text}
                                        className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3"
                                    >
                                        <span className="text-sm text-muted tabular-nums">
                                            {index + 1}.
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm leading-6">
                                                {step.text}
                                            </p>
                                            {step.address ? (
                                                <CopyAddress
                                                    address={step.address}
                                                />
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ol>

                            <p className="mt-6 text-sm leading-6 text-muted">
                                {BROWSERS[name].note}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
