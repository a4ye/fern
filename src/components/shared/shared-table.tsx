"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    APPLICATION_COLUMNS as COLUMNS,
    ApplicationsHeaderRow,
    ROW_HEIGHT,
    ROW_REM,
} from "@/components/dashboard/applications-columns";
import { ApplicationsFilterMenu } from "@/components/dashboard/applications-filter";
import type { ExportFormat } from "@/components/dashboard/applications-export";
import {
    DownloadMenu,
    type DownloadFormat,
} from "@/components/dashboard/download-menu";
import { LocalDateTime } from "@/components/dashboard/local-date-time";
import { useRowWindow } from "@/components/dashboard/use-row-window";
import {
    NO_FILTERS,
    applicationsView,
    isFiltered,
    nextSort,
    payInCurrency,
    type Filters,
    type Sort,
} from "@/components/dashboard/applications-view";
import {
    CURRENCY_OPTIONS,
    CellSelect,
    SearchField,
    quietButtonClass,
    secondaryButtonClass,
    type Option,
} from "@/components/dashboard/table-controls";
import { CURRENCY_MARK_CLASS } from "@/components/dashboard/currency-flag";
import {
    STATUS_META,
    arrangementLabel,
    formatDay,
    type ApplicationRow,
} from "@/components/dashboard/data";
import { fileSlug, saveBlob } from "@/lib/download";
import type { ExchangeRates } from "@/lib/exchange";

// The table somebody who was sent a list reads it in. It draws the same grid as
// the owner's, so a shared list is recognisably the same table, and it imports
// no server action at all: there is nothing here that could write, rather than
// a write that is hidden. The columns a row can be edited through are simply
// absent, and the checkbox column stays empty so the two stay aligned.

const ORIGINAL_PAY: Option<string | null> = {
    value: null,
    label: "Original",
    keywords: ["none", "off", "as recorded", "unconverted"],
    icon: (
        <span
            aria-hidden="true"
            className={`icon-[lucide--circle-dashed] ${CURRENCY_MARK_CLASS}`}
        />
    ),
};

const EXPORT_FORMATS: readonly DownloadFormat<ExportFormat>[] = [
    { id: "csv", label: "CSV", icon: "icon-[lucide--file-text]" },
    { id: "xlsx", label: "XLSX", icon: "icon-[lucide--sheet]" },
    { id: "json", label: "JSON", icon: "icon-[lucide--braces]" },
];

const Cell = ({
    value,
    title,
    className = "text-sub",
}: {
    value: string | null;
    title?: string | null;
    className?: string;
}) => (
    <span
        className={`truncate ${className}`}
        title={title ?? value ?? undefined}
    >
        {value}
    </span>
);

const Row = ({
    app,
    convertedPay,
}: {
    app: ApplicationRow;
    convertedPay: string | null;
}) => {
    const meta = STATUS_META[app.status];
    return (
        <li
            className={`${COLUMNS} ${ROW_HEIGHT} border-b border-faint px-5 text-xs transition-colors last:border-b-0 hover:bg-surface`}
        >
            <span />
            <Cell value={app.company} className="font-medium text-ink" />
            <Cell value={app.role} />
            <span className="min-w-0">
                <span
                    className={`inline-flex max-w-full items-center truncate px-2 py-0.5 font-medium ${meta.plate}`}
                    title={meta.label}
                >
                    {meta.label}
                </span>
            </span>
            <Cell value={app.location} />
            <Cell
                value={
                    app.arrangement ? arrangementLabel(app.arrangement) : null
                }
            />
            <Cell
                value={convertedPay ?? app.pay}
                title={
                    convertedPay &&
                    app.pay &&
                    `${convertedPay}, from ${app.pay}`
                }
                className="text-sub tabular-nums"
            />
            <Cell
                value={app.appliedAt ? formatDay(app.appliedAt) : null}
                className="text-sub tabular-nums"
            />
            <LocalDateTime
                dateTime={app.updatedAt}
                className="truncate text-muted tabular-nums"
            >
                {app.updated}
            </LocalDateTime>
            <span className="flex items-center justify-end self-stretch text-muted">
                {app.url && (
                    <a
                        href={app.url}
                        target="_blank"
                        // The address of a share link is its whole key, so it
                        // must not travel to an employer's site as a referrer.
                        rel="noreferrer"
                        title="Open posting"
                        aria-label="Open posting"
                        className="flex h-full w-8 items-center justify-center transition-colors hover:text-ink"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--link] block size-3.5"
                        />
                    </a>
                )}
            </span>
        </li>
    );
};

export const SharedTable = ({
    name,
    applications,
    rates,
}: {
    name: string;
    applications: ApplicationRow[];
    rates: ExchangeRates;
}) => {
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [sort, setSort] = useState<Sort | null>(null);
    const [convertTo, setConvertTo] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const view = useMemo(
        () => applicationsView(applications, filters, sort, rates, convertTo),
        [applications, filters, sort, rates, convertTo],
    );
    const rowWindow = useRowWindow(
        scrollRef,
        listRef,
        view.rows.length,
        ROW_REM,
    );
    const filtered = isFiltered(filters);

    const currencyOptions = useMemo(
        () => [ORIGINAL_PAY, ...CURRENCY_OPTIONS],
        [],
    );

    const exportRows = async (format: ExportFormat) => {
        try {
            const { applicationsFile } =
                await import("@/components/dashboard/applications-export");
            saveBlob(
                applicationsFile(view.rows, format, name),
                `${fileSlug(name)}-applications.${format}`,
            );
        } catch {
            toast.error("Could not export these applications.");
        }
    };

    return (
        <section className="border border-hairline bg-background">
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-5 py-2 lg:py-0">
                <h2 className="flex shrink-0 items-baseline gap-2 text-xs font-medium text-muted">
                    Applications
                    <span className="text-sub tabular-nums">
                        {filtered
                            ? `${view.rows.length} of ${applications.length}`
                            : applications.length}
                    </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
                    {applications.length > 0 && (
                        <div className="flex items-center gap-2 max-sm:w-full">
                            <SearchField
                                value={filters.query}
                                onChange={(query) =>
                                    setFilters({ ...filters, query })
                                }
                            />
                            <ApplicationsFilterMenu
                                filters={filters}
                                statusCounts={view.statusCounts}
                                arrangementCounts={view.arrangementCounts}
                                onChange={setFilters}
                            />
                        </div>
                    )}
                    <CellSelect
                        value={convertTo}
                        options={currencyOptions}
                        onChange={setConvertTo}
                        label="Currency to read pay in"
                        triggerLabel={
                            convertTo ? `Pay in ${convertTo}` : "Pay currency"
                        }
                        variant="button"
                        searchable
                        className="max-sm:grow sm:w-44"
                    />
                    {view.rows.length > 0 && (
                        <DownloadMenu
                            title="Export these applications"
                            heading={
                                filtered
                                    ? `${view.rows.length} shown`
                                    : `${view.rows.length} application${view.rows.length === 1 ? "" : "s"}`
                            }
                            formats={EXPORT_FORMATS}
                            className="max-sm:grow"
                            triggerClass={`${secondaryButtonClass} max-sm:w-full max-sm:justify-center`}
                            onSelect={exportRows}
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--download] size-4 shrink-0"
                            />
                            Export
                        </DownloadMenu>
                    )}
                </div>
            </div>

            {applications.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-sub">
                    No applications in this list yet.
                </p>
            ) : view.rows.length === 0 ? (
                <div className="px-5 py-16 text-center">
                    <p className="text-sm text-sub">
                        No applications match this search.
                    </p>
                    <button
                        type="button"
                        onClick={() => setFilters(NO_FILTERS)}
                        className={`${quietButtonClass} mt-3`}
                    >
                        Clear search and filters
                    </button>
                </div>
            ) : (
                <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
                    <ApplicationsHeaderRow
                        sort={sort}
                        onSort={(key) =>
                            setSort((current) => nextSort(current, key))
                        }
                    />
                    <ul ref={listRef}>
                        {rowWindow.padTop > 0 && (
                            <li
                                aria-hidden="true"
                                style={{
                                    height: `${rowWindow.padTop * ROW_REM}rem`,
                                }}
                            />
                        )}
                        {view.rows
                            .slice(rowWindow.start, rowWindow.end)
                            .map((app) => (
                                <Row
                                    key={app.id}
                                    app={app}
                                    convertedPay={
                                        convertTo &&
                                        payInCurrency(app, convertTo, rates)
                                    }
                                />
                            ))}
                        {rowWindow.padBottom > 0 && (
                            <li
                                aria-hidden="true"
                                style={{
                                    height: `${rowWindow.padBottom * ROW_REM}rem`,
                                }}
                            />
                        )}
                    </ul>
                </div>
            )}
        </section>
    );
};
