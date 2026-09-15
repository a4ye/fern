"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { FunnelSummary } from "@/components/dashboard/funnel-summary";
import {
    LocationMapPanel,
    MAP_HEIGHT,
} from "@/components/dashboard/location-map-panel";
import { PipelineFlow } from "@/components/dashboard/pipeline-flow";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import type {
    FlowEntry,
    Funnel,
    Place,
    Stat,
    Volume,
} from "@/components/dashboard/data";

const LocationMap = dynamic(
    () =>
        import("@/components/dashboard/location-map").then(
            (module) => module.LocationMap,
        ),
    {
        ssr: false,
        loading: () => <div style={{ height: MAP_HEIGHT }} />,
    },
);

// Sits above the applications table, so the charts and panels stay one click
// away without pushing the table below a list that can run to hundreds of rows.
export const ListInsights = ({
    name,
    stats,
    funnel,
    flow,
    volume,
    places,
}: {
    name: string;
    stats: Stat[];
    funnel: Funnel;
    flow: FlowEntry[];
    volume: Volume;
    places: Place[];
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
                    <div className="grid items-stretch gap-4 lg:grid-cols-[2fr_3fr]">
                        <FunnelSummary funnel={funnel} />
                        <VolumeChart volume={volume} />
                    </div>
                    {/* Full width as well: a map squeezed into half a row leaves
                        the cities on top of each other before it is zoomed. */}
                    <LocationMapPanel places={places}>
                        <LocationMap places={places} />
                    </LocationMapPanel>
                </div>
            )}
        </div>
    );
};
