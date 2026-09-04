"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { loadListInsights } from "@/app/dashboard/actions";
import { InsightsPlaceholder } from "@/components/dashboard/insights-placeholder";
import { StatStrip } from "@/components/dashboard/stat-strip";
import type { ListInsightsData, Stat } from "@/components/dashboard/data";

const InsightsContent = dynamic(
    () =>
        import("@/components/dashboard/list-insights-content").then(
            (module) => module.ListInsightsContent,
        ),
    { loading: () => <InsightsPlaceholder /> },
);

// Sits above the applications table, so the charts and panels stay one click
// away without pushing the table below a list that can run to hundreds of rows.
export const ListInsights = ({
    name,
    listId,
    stats,
}: {
    name: string;
    listId: string;
    stats: Stat[];
}) => {
    const [open, setOpen] = useState(false);
    const [insights, setInsights] = useState<ListInsightsData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startLoading] = useTransition();

    const toggle = () => {
        if (open) {
            setOpen(false);
            return;
        }

        setOpen(true);
        if (insights || isPending) return;
        setError(null);
        startLoading(async () => {
            try {
                const loaded = await loadListInsights(listId);
                if (loaded) {
                    setInsights(loaded);
                    return;
                }
            } catch {
                // A rejected action request reads the same as an unavailable
                // list here. Either way the table remains usable.
            }
            setError("Insights could not be loaded.");
        });
    };

    return (
        <div>
            {/* One row on a wide bar. Narrow, the toggle drops to a full-width
                footer of its own rather than trailing the stats, which left it
                stranded against the right edge under a ragged last line. */}
            <div className="border border-hairline bg-background sm:flex sm:items-center sm:gap-x-8 sm:px-4 sm:py-3">
                <div className="px-4 py-3 sm:min-w-0 sm:flex-1 sm:p-0">
                    <StatStrip stats={stats} />
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    className="flex h-11 w-full cursor-pointer items-center justify-between border-t border-faint px-4 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-8 sm:w-auto sm:shrink-0 sm:justify-start sm:gap-1.5 sm:border-t-0 sm:px-0"
                >
                    Insights
                    <span
                        aria-hidden="true"
                        className={`icon-[lucide--chevron-down] size-4 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                </button>
            </div>
            {open && (
                <div className="mt-4 flex flex-col gap-4">
                    <InsightsContent
                        name={name}
                        insights={insights}
                        error={error}
                    />
                </div>
            )}
        </div>
    );
};
