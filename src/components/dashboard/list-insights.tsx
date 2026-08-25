"use client";

import { useState } from "react";
import { PipelineFlow } from "@/components/dashboard/pipeline-flow";
import { PipelineSummary } from "@/components/dashboard/pipeline-summary";
import { StatStrip } from "@/components/dashboard/stat-strip";
import type {
    FlowEntry,
    PipelineEntry,
    Stat,
} from "@/components/dashboard/data";

// Sits above the applications table, so the charts stay one click away without
// pushing the table below a visualization that can be several rows tall.
export const ListInsights = ({
    name,
    stats,
    pipeline,
    flow,
}: {
    name: string;
    stats: Stat[];
    pipeline: PipelineEntry[];
    flow: FlowEntry[];
}) => {
    const [open, setOpen] = useState(false);

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
                    onClick={() => setOpen((previous) => !previous)}
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
                    {/* The flow takes the full width: it can run to six columns
                        of labelled nodes, which crowd badly in half a row. */}
                    <PipelineFlow flow={flow} name={name} />
                    <PipelineSummary pipeline={pipeline} />
                </div>
            )}
        </div>
    );
};
