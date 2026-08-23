"use client";

import { ResponsiveLine } from "@nivo/line";
import {
    CHART_HOST,
    CHART_THEME,
    ChartTip,
} from "@/components/dashboard/chart-theme";
import type { Volume, VolumeBar } from "@/components/dashboard/data";

const UNIT_LABEL: Record<Volume["unit"], string> = {
    day: "by day",
    week: "by week",
    month: "by month",
};

const DAY = 24 * 60 * 60 * 1000;

// How often the axis is named. This follows the length of the run rather than
// the period it counts in, because a chart counting by day now covers anything
// from a fortnight to half a year.
const axisFor = (days: number) =>
    days <= 24
        ? { tickValues: "every 3 days", format: "%b %-d" }
        : days <= 70
          ? { tickValues: "every 1 week", format: "%b %-d" }
          : days <= 300
            ? { tickValues: "every 1 month", format: "%b" }
            : { tickValues: "every 3 months", format: "%b %Y" };

const spanOf = (bars: VolumeBar[]) =>
    bars.length === 0
        ? 0
        : (Date.parse(bars[bars.length - 1].start) -
              Date.parse(bars[0].start)) /
          DAY;

// Gridlines land on whole applications: half an application was never sent.
const axisValues = (peak: number) =>
    peak <= 5
        ? Array.from({ length: peak + 1 }, (_, count) => count)
        : [0, Math.round(peak / 2), peak];

const pointFor = (bar: VolumeBar, unit: Volume["unit"]) => ({
    x: bar.start,
    y: bar.count,
    name: unit === "week" ? `Week of ${bar.label}` : bar.label,
    detail: `${bar.count} ${bar.count === 1 ? "application" : "applications"}`,
    days: bar.days,
});

export const VolumeChart = ({ volume }: { volume: Volume }) => {
    const peak = Math.max(1, ...volume.bars.map((bar) => bar.count));

    return (
        <section className="border border-hairline bg-background">
            <div className="flex h-10 items-center justify-between border-b border-hairline px-4">
                <h2 className="text-xs font-medium text-muted">
                    When you applied
                </h2>
                {volume.total > 0 && (
                    <span className="text-xs text-muted">
                        {UNIT_LABEL[volume.unit]}
                    </span>
                )}
            </div>
            {volume.total === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    No applications sent yet.
                </p>
            ) : (
                <div className={CHART_HOST}>
                    <ResponsiveLine
                        data={[
                            {
                                id: "applications",
                                data: volume.bars.map((bar) =>
                                    pointFor(bar, volume.unit),
                                ),
                            },
                        ]}
                        theme={CHART_THEME}
                        margin={{ top: 8, right: 16, bottom: 24, left: 30 }}
                        xScale={{
                            type: "time",
                            format: "%Y-%m-%d",
                            precision: "day",
                            useUTC: false,
                        }}
                        yScale={{ type: "linear", min: 0, max: peak }}
                        // Monotone rather than a loose spline: it bends between
                        // the periods it was given without arcing above any of
                        // them, so the curve never draws a busier day than
                        // there was.
                        curve="monotoneX"
                        colors={["var(--color-accent-deep)"]}
                        lineWidth={1.5}
                        enableArea
                        areaBaselineValue={0}
                        areaOpacity={1}
                        defs={[
                            {
                                id: "volume-area",
                                type: "linearGradient",
                                colors: [
                                    {
                                        offset: 0,
                                        color: "var(--color-accent)",
                                        opacity: 0.35,
                                    },
                                    {
                                        offset: 100,
                                        color: "var(--color-accent)",
                                        opacity: 0.02,
                                    },
                                ],
                            },
                        ]}
                        fill={[{ match: "*", id: "volume-area" }]}
                        enablePoints={false}
                        enableGridX={false}
                        gridYValues={axisValues(peak)}
                        axisLeft={{
                            tickSize: 0,
                            tickPadding: 6,
                            tickValues: axisValues(peak),
                        }}
                        axisBottom={{
                            tickSize: 0,
                            tickPadding: 8,
                            ...axisFor(spanOf(volume.bars)),
                        }}
                        enableSlices="x"
                        sliceTooltip={({ slice }) => {
                            const { data } = slice.points[0];
                            return (
                                <ChartTip
                                    name={data.name}
                                    detail={data.detail}
                                    rows={data.days}
                                />
                            );
                        }}
                        motionConfig="gentle"
                    />
                </div>
            )}
        </section>
    );
};
