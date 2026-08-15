import type { Stat } from "@/components/dashboard/data";

// Packed left on a wide bar. Narrow, the same wrapping strands the last stat
// alone on a line of its own, so the stats pair off into a grid instead.
export const StatStrip = ({ stats }: { stats: Stat[] }) => (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:flex sm:flex-wrap sm:items-baseline">
        {stats.map((stat) => (
            <p key={stat.label} className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-ink tabular-nums">
                    {stat.value}
                </span>
                <span className="text-xs text-muted">{stat.label}</span>
            </p>
        ))}
    </div>
);
