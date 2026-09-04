"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
    activityGridFrom,
    activityLevel,
    calendarYearRange,
    calendarYearsFrom,
    trailingYearRange,
    type ActivityCell,
} from "@/components/dashboard/application-activity-grid";
import type { Volume } from "@/components/dashboard/data";

const LEVEL_CLASS = [
    "border-hairline bg-surface",
    "border-accent/10 bg-accent/20",
    "border-accent/10 bg-accent/40",
    "border-accent/10 bg-accent/70",
    "border-accent bg-accent",
];

type HoverTip = {
    description: string;
    left: number;
    top: number;
};

const DaySquare = ({
    cell,
    showTip,
    hideTip,
}: {
    cell: ActivityCell;
    showTip: (tip: HoverTip) => void;
    hideTip: () => void;
}) => {
    if (!cell.visible) {
        return <span aria-hidden="true" className="size-2.5" />;
    }

    const handlePointerEnter = (event: ReactPointerEvent<HTMLSpanElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        showTip({
            description: cell.description,
            left: Math.min(
                window.innerWidth - 136,
                Math.max(136, bounds.left + bounds.width / 2),
            ),
            top: bounds.top,
        });
    };

    return (
        <span
            aria-hidden="true"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={hideTip}
            className={`size-2.5 border outline-offset-1 hover:outline hover:outline-1 hover:outline-accent-deep ${LEVEL_CLASS[activityLevel(cell.count)]}`}
        />
    );
};

const PERIOD_BUTTON =
    "relative h-8 w-20 shrink-0 cursor-pointer px-3 text-center text-xs whitespace-nowrap tabular-nums transition-[color,background-color,scale] duration-150 ease-out after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96]";

const PeriodButtons = ({
    years,
    selectedYear,
    selectYear,
    className,
}: {
    years: number[];
    selectedYear: number | null;
    selectYear: (year: number | null) => void;
    className: string;
}) => (
    <nav aria-label="Application activity period" className={className}>
        <button
            type="button"
            aria-pressed={selectedYear === null}
            onClick={() => selectYear(null)}
            className={`${PERIOD_BUTTON} ${selectedYear === null ? "bg-accent text-background" : "text-sub hover:bg-accent-tint-soft"}`}
        >
            Past year
        </button>
        {years.map((year) => (
            <button
                key={year}
                type="button"
                aria-pressed={selectedYear === year}
                onClick={() => selectYear(year)}
                className={`${PERIOD_BUTTON} ${selectedYear === year ? "bg-accent text-background" : "text-sub hover:bg-accent-tint-soft"}`}
            >
                {year}
            </button>
        ))}
    </nav>
);

export const VolumeChart = ({ volume }: { volume: Volume }) => {
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [tip, setTip] = useState<HoverTip | null>(null);
    const years = calendarYearsFrom(volume);
    const activeYear =
        selectedYear !== null && years.includes(selectedYear)
            ? selectedYear
            : null;
    const range =
        activeYear === null
            ? trailingYearRange(volume.through)
            : calendarYearRange(activeYear);
    const grid = activityGridFrom(volume, range);
    const applicationLabel = `${grid.total} ${grid.total === 1 ? "application" : "applications"}`;
    const periodLabel =
        activeYear === null ? "in the past year" : `in ${activeYear}`;
    const selectYear = (year: number | null) => {
        setSelectedYear(year);
        setTip(null);
    };

    return (
        <section className="min-w-0 border border-hairline bg-background">
            <div className="flex min-h-10 items-center justify-between gap-4 border-b border-hairline px-4 py-2">
                <h2 className="text-xs font-medium text-muted">
                    Application activity
                </h2>
                {volume.total > 0 && (
                    <span className="text-xs text-muted tabular-nums">
                        {applicationLabel} {periodLabel}
                    </span>
                )}
            </div>
            {volume.total === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    No applications sent yet.
                </p>
            ) : (
                <>
                    <PeriodButtons
                        years={years}
                        selectedYear={activeYear}
                        selectYear={selectYear}
                        className="flex h-10 items-center gap-1 overflow-x-auto border-b border-faint px-2"
                    />
                    <div
                        onScroll={() => setTip(null)}
                        className="min-w-0 overflow-x-auto px-4 pt-4 pb-4"
                    >
                        <div
                            role="img"
                            aria-label={`${applicationLabel} from ${grid.range}. Darker squares represent more applications sent on that day.`}
                            className="w-max min-w-full"
                        >
                            <div
                                className="mb-1 ml-7 grid h-4 gap-0.75 text-xs text-muted"
                                style={{
                                    gridTemplateColumns: `repeat(${grid.weeks}, 0.625rem)`,
                                }}
                            >
                                {grid.months.map((month) => (
                                    <span
                                        key={`${month.label}-${month.column}`}
                                        aria-hidden="true"
                                        style={{
                                            gridColumnStart: month.column + 1,
                                        }}
                                    >
                                        {month.label}
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <div
                                    aria-hidden="true"
                                    className="grid w-5 shrink-0 grid-rows-7 gap-0.75 text-xs leading-2.5 text-muted"
                                >
                                    <span className="row-start-2">Mon</span>
                                    <span className="row-start-4">Wed</span>
                                    <span className="row-start-6">Fri</span>
                                </div>
                                <div
                                    className="grid grid-flow-col grid-rows-7 gap-0.75"
                                    style={{
                                        gridTemplateColumns: `repeat(${grid.weeks}, 0.625rem)`,
                                    }}
                                >
                                    {grid.cells.map((cell) => (
                                        <DaySquare
                                            key={cell.date}
                                            cell={cell}
                                            showTip={setTip}
                                            hideTip={() => setTip(null)}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div
                                aria-hidden="true"
                                className="mt-3 flex items-center justify-end gap-1 text-xs text-muted"
                            >
                                <span className="mr-1">Less</span>
                                {LEVEL_CLASS.map((level, index) => (
                                    <span
                                        key={level}
                                        className={`size-2.5 border ${LEVEL_CLASS[index]}`}
                                    />
                                ))}
                                <span className="ml-1">More</span>
                            </div>
                        </div>
                    </div>
                </>
            )}
            {tip && (
                <div
                    role="tooltip"
                    style={{
                        left: tip.left,
                        top: tip.top,
                        transform: "translate(-50%, calc(-100% - 8px))",
                    }}
                    className="pointer-events-none fixed z-50 border border-ink bg-ink px-2 py-1 text-xs whitespace-nowrap text-background tabular-nums after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-ink"
                >
                    {tip.description}
                </div>
            )}
        </section>
    );
};
