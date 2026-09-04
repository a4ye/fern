"use client";

import { FunnelSummary } from "@/components/dashboard/funnel-summary";
import { InsightsPlaceholder } from "@/components/dashboard/insights-placeholder";
import { PipelineFlow } from "@/components/dashboard/pipeline-flow";
import { VolumeChart } from "@/components/dashboard/volume-chart";
import type { ListInsightsData } from "@/components/dashboard/data";

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
        </>
    );
};
