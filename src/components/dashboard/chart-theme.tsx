// Nivo paints axes, grid lines and crosshairs itself rather than from a
// stylesheet, so the tokens are handed to it in the same form the flow chart
// uses. Sizes match text-xs.
export const CHART_THEME = {
    text: { fontFamily: "inherit", fontSize: 12 },
    axis: {
        domain: { line: { stroke: "var(--color-hairline)" } },
        ticks: {
            line: { stroke: "transparent" },
            text: { fill: "var(--color-muted)" },
        },
    },
    grid: { line: { stroke: "var(--color-faint)" } },
    crosshair: {
        line: {
            stroke: "var(--color-accent-deep)",
            strokeWidth: 1,
            strokeOpacity: 0.45,
            strokeDasharray: "3 3",
        },
    },
};

// Nivo lays its charts out inside a wrapper that collapses to nothing, so the
// positioning container it measures comes back zero wide. It decides which side
// of the pointer to hang a tooltip on by asking which half of that container the
// pointer is in, and against a width of zero the answer is always the same one:
// every tooltip goes to the left of the pointer, and near the left edge, off the
// screen. Sizing the container to its contents gives that test a real width.
export const CHART_HOST = "h-44 px-2 pt-3 pb-1 [&>div>div]:w-max";

// The hover plate, matching the one the flow chart raises. `rows` breaks the
// hovered period down when it stands for more than it can draw.
//
// The name and the count are stacked rather than run together on one line: the
// plate has to stay narrower than half the chart, since that is the point where
// nivo swaps the side it hangs on, and on a phone half a chart is not wide.
export const ChartTip = ({
    name,
    detail,
    rows = [],
}: {
    name: string;
    detail: string;
    rows?: { label: string; count: number }[];
}) => (
    <div className="border border-hairline bg-background text-xs whitespace-nowrap text-ink">
        <div className="px-2 py-1">
            <div className="font-medium">{name}</div>
            <div className="text-sub">{detail}</div>
        </div>
        {rows.length > 0 && (
            <div className="border-t border-faint px-2 py-1">
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className="flex justify-between gap-5 tabular-nums"
                    >
                        <span className="text-sub">{row.label}</span>
                        <span>{row.count}</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);
