"use client";

import { useEffect, useState } from "react";

export const CopyAddress = ({ address }: { address: string }) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1600);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <div className="mt-2 flex h-9 w-full items-center border border-hairline bg-surface">
            <span className="min-w-0 flex-1 truncate px-2.5 font-mono text-sm text-ink">
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
