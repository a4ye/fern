"use client";

import dynamic from "next/dynamic";
import { FunnelSummary } from "@/components/dashboard/funnel-summary";
import { InsightsPlaceholder } from "@/components/dashboard/insights-placeholder";
import {
    LocationMapPanel,
    MAP_HEIGHT,
} from "@/components/dashboard/location-map-panel";
import { PipelineFlow } from "@/components/dashboard/pipeline-flow";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import type { ListInsightsData } from "@/components/dashboard/data";

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

export const ListInsightsContent = ({
    name,
    insights,
    error,
}: {
    name: string;
    insights: ListInsightsData | null;
    error: string | null;
}) => {
    if (!insights) return <InsightsPlaceholder error={error} />;

    return (
        <>
            <PipelineFlow flow={insights.flow} name={name} />
            <div className="grid items-stretch gap-4 lg:grid-cols-[2fr_3fr]">
                <FunnelSummary funnel={insights.funnel} />
                <VolumeChart volume={insights.volume} />
            </div>
            {/* A row to itself: a map squeezed into half of one leaves the
                cities on top of each other before it is zoomed. */}
            <LocationMapPanel places={insights.places}>
                <LocationMap places={insights.places} />
            </LocationMapPanel>
        </>
    );
};
