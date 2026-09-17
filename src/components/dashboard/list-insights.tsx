"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
    revision,
}: {
    name: string;
    listId: string;
    stats: Stat[];
    revision: string;
}) => {
    const [open, setOpen] = useState(false);
    const [insights, setInsights] = useState<ListInsightsData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [, startLoading] = useTransition();
    const readFor = useRef<string | null>(null);

    // Insights are read apart from the page they sit above, so what the panel
    // holds goes out of date as the table below it is worked in. `revision`
    // says what the list held when the page was drawn, which makes a change in
    // it the signal to read the insights again: in place while the panel is
    // open, and otherwise at the next opening. A write can change a chart
    // without changing a stat, so the reading is not narrowed to the numbers
    // the strip prints.
    useEffect(() => {
        if (!open || readFor.current === revision) return;
        readFor.current = revision;
        setError(null);
        startLoading(async () => {
            // A rejected action request reads the same as an unavailable list
            // here. Either way the table remains usable.
            const read = await loadListInsights(listId).catch(() => null);
            // A later read has taken over, and its answer is the current one.
            if (readFor.current !== revision) return;
            if (read) {
                setInsights(read);
                return;
            }
            // Leaves a retry to the next opening, and drops charts that can no
            // longer be said to be of this list.
            readFor.current = null;
            setInsights(null);
            setError("Insights could not be loaded.");
        });
    }, [open, revision, listId]);

    const toggle = () => setOpen((shown) => !shown);

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
