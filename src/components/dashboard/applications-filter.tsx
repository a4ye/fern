"use client";

import { useEffect, useRef, useState } from "react";
import {
    NO_ARRANGEMENT,
    activeFilterCount,
    type ArrangementValue,
    type Filters,
} from "@/components/dashboard/applications-view";
import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    STATUS_META,
    arrangementLabel,
    type ApplicationStatus,
} from "@/components/dashboard/data";
import {
    checkboxClass,
    secondaryButtonClass,
} from "@/components/dashboard/table-controls";

// Every value of a facet is listed, whether or not the list holds one, so the
// menu reads as the whole vocabulary rather than a sample of what happens to be
// in front of you. One nothing carries cannot be ticked into an empty table,
// but one already ticked can always be cleared again.
const FilterValue = ({
    label,
    count,
    checked,
    text = "text-ink",
    onChange,
}: {
    label: string;
    count: number;
    checked: boolean;
    text?: string;
    onChange: (checked: boolean) => void;
}) => {
    const empty = count === 0 && !checked;
    return (
        <li>
            <label
                className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                    empty
                        ? "cursor-not-allowed opacity-40"
                        : "cursor-pointer hover:bg-surface"
                }`}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={empty}
                    onChange={(event) => onChange(event.target.checked)}
                    // Firefox restores tick marks across a reload, which would
                    // outlive the filter state that drives the table.
                    autoComplete="off"
                    className={checkboxClass}
                />
                <span className={`truncate ${text}`}>{label}</span>
                <span className="ml-auto shrink-0 text-muted tabular-nums">
                    {count}
                </span>
            </label>
        </li>
    );
};

const ARRANGEMENT_VALUES: ArrangementValue[] = [
    ...ARRANGEMENTS,
    NO_ARRANGEMENT,
];

const arrangementValueLabel = (value: ArrangementValue): string =>
    value === NO_ARRANGEMENT ? "Not set" : arrangementLabel(value);

const toggled = <T,>(values: T[], value: T, on: boolean): T[] =>
    on ? [...values, value] : values.filter((held) => held !== value);

// Both facets in one menu rather than one behind each heading: the headings
// already carry the sort, and two of the eight columns are the only ones whose
// values are a closed set worth ticking through.
export const ApplicationsFilterMenu = ({
    filters,
    statusCounts,
    arrangementCounts,
    onChange,
}: {
    filters: Filters;
    statusCounts: Map<ApplicationStatus, number>;
    arrangementCounts: Map<ArrangementValue, number>;
    onChange: (filters: Filters) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const count = activeFilterCount(filters);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                aria-haspopup="true"
                aria-expanded={open}
                className={`${secondaryButtonClass} ${open || count > 0 ? "border-tile-border" : ""}`}
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--list-filter] size-4 shrink-0"
                />
                Filter
                {count > 0 && (
                    <span className="bg-accent-tint px-1.5 text-xs font-medium text-accent-deep tabular-nums">
                        {count}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 z-30 mt-1 w-60 max-w-[calc(100vw-2.5rem)] border border-hairline bg-background shadow-sm">
                    <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
                        <p className="text-xs font-medium text-muted">
                            Filter rows
                        </p>
                        <button
                            type="button"
                            onClick={() =>
                                onChange({
                                    ...filters,
                                    statuses: [],
                                    arrangements: [],
                                })
                            }
                            disabled={count === 0}
                            className="cursor-pointer text-xs text-sub transition-colors hover:text-ink focus-visible:outline-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-sub"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto py-1">
                        <p className="px-3 py-1 text-xs font-medium text-muted">
                            Status
                        </p>
                        <ul>
                            {APPLICATION_STATUSES.map((status) => (
                                <FilterValue
                                    key={status}
                                    label={STATUS_META[status].label}
                                    text={STATUS_META[status].text}
                                    count={statusCounts.get(status) ?? 0}
                                    checked={filters.statuses.includes(status)}
                                    onChange={(checked) =>
                                        onChange({
                                            ...filters,
                                            statuses: toggled(
                                                filters.statuses,
                                                status,
                                                checked,
                                            ),
                                        })
                                    }
                                />
                            ))}
                        </ul>
                        <p className="border-t border-faint px-3 pt-2 pb-1 text-xs font-medium text-muted">
                            Arrangement
                        </p>
                        <ul>
                            {ARRANGEMENT_VALUES.map((value) => (
                                <FilterValue
                                    key={value}
                                    label={arrangementValueLabel(value)}
                                    count={arrangementCounts.get(value) ?? 0}
                                    checked={filters.arrangements.includes(
                                        value,
                                    )}
                                    onChange={(checked) =>
                                        onChange({
                                            ...filters,
                                            arrangements: toggled(
                                                filters.arrangements,
                                                value,
                                                checked,
                                            ),
                                        })
                                    }
                                />
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};
