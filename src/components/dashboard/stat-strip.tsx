import type { Stat } from "@/components/dashboard/data";

export const StatStrip = ({ stats }: { stats: Stat[] }) => (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
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
