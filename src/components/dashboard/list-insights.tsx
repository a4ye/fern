"use client";

import { useState } from "react";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PipelineFlow } from "@/components/dashboard/pipeline-flow";
import { PipelineSummary } from "@/components/dashboard/pipeline-summary";
import { StatStrip } from "@/components/dashboard/stat-strip";
import type {
    ActivityItem,
    FlowEntry,
    PipelineEntry,
    Stat,
} from "@/components/dashboard/data";

// Sits above the applications table, so the charts and feed stay one click away
// without pushing the table below a list that can run to hundreds of rows.
export const ListInsights = ({
    name,
    stats,
    pipeline,
    flow,
    activity,
}: {
    name: string;
    stats: Stat[];
    pipeline: PipelineEntry[];
    flow: FlowEntry[];
    activity: ActivityItem[];
}) => {
    const [open, setOpen] = useState(false);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border border-hairline bg-background px-4 py-3">
                <StatStrip stats={stats} />
                <button
                    type="button"
                    onClick={() => setOpen((previous) => !previous)}
                    aria-expanded={open}
                    className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                        <PipelineSummary pipeline={pipeline} />
                        <ActivityFeed activity={activity} />
                    </div>
                </div>
            )}
        </div>
    );
};
