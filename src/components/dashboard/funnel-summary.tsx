"use client";

import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import {
    CHART_HOST,
    CHART_THEME,
    ChartTip,
} from "@/components/dashboard/chart-theme";
import type { Funnel } from "@/components/dashboard/data";

// The stage ramp used everywhere else, deepening towards the offer. What is left
// of the row is the applications that never got this far.
const FILL: Record<string, string> = {
    applied: "var(--color-tile-border)",
    replied: "var(--color-accent)",
    interviewed: "var(--color-accent-deep)",
    offer: "var(--color-gold)",
};

const LOST = "var(--color-faint)";

// The share is printed on the bar, so it has to hold against the fill under it.
const LABEL_INK: Record<string, string> = {
    applied: "var(--color-sub)",
    replied: "var(--color-background)",
    interviewed: "var(--color-background)",
    offer: "var(--color-background)",
};

// A stage one application in a thousand reached is not none of them, and
// rounding it down to a flat 0% next to a count of 1 reads as a bug.
const percentLabel = ({
    count,
    percent,
}: {
    count: number;
    percent: number;
}) => (count > 0 && percent === 0 ? "<1%" : `${percent}%`);

type Row = BarDatum & {
    stage: string;
    tone: string;
    reached: number;
    lost: number;
    share: string;
    detail: string;
};

// A horizontal chart is drawn from the bottom up, so the order is reversed to
// put what was sent at the top and read downwards from there.
const rowsOf = (funnel: Funnel): Row[] =>
    [
        {
            stage: "Applied",
            tone: "applied",
            reached: funnel.applied,
            lost: 0,
            share: "100%",
            detail: `${funnel.applied} sent`,
        },
        ...funnel.stages.map((stage) => ({
            stage: stage.label,
            tone: stage.key,
            reached: stage.count,
            lost: funnel.applied - stage.count,
            share: percentLabel(stage),
            detail: `${stage.count} of ${funnel.applied}`,
        })),
    ].reverse();

export const FunnelSummary = ({ funnel }: { funnel: Funnel }) => (
    <section className="border border-hairline bg-background">
        <div className="flex h-10 items-center border-b border-hairline px-4">
            <h2 className="text-xs font-medium text-muted">Progress</h2>
        </div>
        {funnel.applied === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-sub">
                No applications sent yet.
            </p>
        ) : (
            <div className={CHART_HOST}>
                <ResponsiveBar
                    data={rowsOf(funnel)}
                    keys={["reached", "lost"]}
                    indexBy="stage"
                    layout="horizontal"
                    theme={CHART_THEME}
                    margin={{ top: 6, right: 16, bottom: 24, left: 88 }}
                    padding={0.28}
                    colors={(bar) =>
                        bar.id === "lost" ? LOST : FILL[String(bar.data.tone)]
                    }
                    // Every row is covered edge to edge by its own track, so a
                    // grid behind the bars would never show through.
                    enableGridX={false}
                    enableGridY={false}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: 4 }}
                    label={(bar) =>
                        bar.id === "reached" ? String(bar.data.share) : ""
                    }
                    labelSkipWidth={34}
                    labelTextColor={({ data: bar }) =>
                        LABEL_INK[String(bar.data.tone)]
                    }
                    // Either half of a row raises the same plate, so the whole
                    // row is one target rather than the filled part only.
                    tooltip={(bar) => (
                        <ChartTip
                            name={String(bar.data.stage)}
                            detail={String(bar.data.detail)}
                        />
                    )}
                    motionConfig="gentle"
                />
            </div>
        )}
    </section>
);
