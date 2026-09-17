import Link from "next/link";
import {
    APPLICATION_COLUMNS,
    ApplicationsHeaderRow,
    ROW_HEIGHT,
} from "@/components/dashboard/applications-columns";

// Loading placeholders for a single list. Each block mirrors the real section
// it stands in for (same padding, line-box heights, and column widths), so
// swapping to real content doesn't resize the page or shift the layout. Static
// chrome (the back link, section headings) renders for real to avoid a flash.

const Cell = ({ width }: { width: string }) => (
    <span className="flex h-4 items-center">
        <span className={`skeleton h-3 max-w-full ${width}`} />
    </span>
);

// A bar the width of the words it stands in for, so a label cannot drift from
// the one the real section prints.
const TextBar = ({
    children,
    className = "",
}: {
    children: string;
    className?: string;
}) => (
    <span className={`skeleton inline-flex h-3 ${className}`}>
        <span className="invisible">{children}</span>
    </span>
);

// The whole control is painted, sized by its own label inside the real button's
// box, so adding or renaming one keeps the bar the same length as the toolbar.
const ControlSkeleton = ({
    label,
    className = "",
}: {
    label: string;
    className?: string;
}) => (
    <span
        className={`skeleton inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-sm whitespace-nowrap ${className}`}
    >
        <span className="size-4 shrink-0" />
        <span className="invisible">{label}</span>
    </span>
);

const STAT_LABELS = ["Total", "Active", "Interviewing", "Offers"];

const ApplicationRowSkeleton = ({ viewing }: { viewing: boolean }) => (
    <li
        className={`${APPLICATION_COLUMNS} ${ROW_HEIGHT} border-b border-faint px-5 last:border-b-0`}
    >
        {viewing ? <span /> : <span className="skeleton size-3.5" />}
        <Cell width="w-28" />
        <Cell width="w-36" />
        {/* Status renders as a filled plate in the real row, so the placeholder
            matches that box rather than a text line. */}
        <span className="skeleton h-5 w-20" />
        <Cell width="w-24" />
        <Cell width="w-14" />
        <Cell width="w-16" />
        <Cell width="w-12" />
        <Cell width="w-12" />
        <span />
    </li>
);

// `viewing` drops the same controls the real page leaves out while an admin is
// viewing another account, so the toolbar is the same length either way.
export const SeasonPageSkeleton = ({
    viewing = false,
}: {
    viewing?: boolean;
}) => (
    <div className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10 sm:px-10">
        <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink"
        >
            <span
                aria-hidden="true"
                className="icon-[lucide--chevron-left] size-4"
            />
            Lists
        </Link>

        <div aria-hidden="true" className="mt-4">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <span className="skeleton block h-8 w-64 max-w-full" />
                    <span className="mt-2 flex h-5 items-center">
                        <span className="skeleton h-3.5 w-96 max-w-full" />
                    </span>
                </div>
                <div className="flex min-h-10 shrink-0 items-center justify-end">
                    {viewing ? null : (
                        <span className="inline-flex h-10 min-w-10 items-center gap-2 pr-2.5 pl-2">
                            <span className="skeleton size-4 shrink-0" />
                            <TextBar className="hidden text-sm sm:inline-flex">
                                Share
                            </TextBar>
                        </span>
                    )}
                    <span className="inline-flex h-10 min-w-10 items-center gap-2 pr-2.5 pl-2">
                        <span className="skeleton size-4 shrink-0" />
                        <TextBar className="hidden text-sm sm:inline-flex">
                            History
                        </TextBar>
                    </span>
                    {viewing ? null : (
                        <>
                            <span className="flex size-10 items-center justify-center">
                                <span className="skeleton size-4" />
                            </span>
                            <span className="flex size-10 items-center justify-center">
                                <span className="skeleton size-4" />
                            </span>
                        </>
                    )}
                </div>
            </div>
            <div className="mt-2 flex h-8 items-center">
                <span className="skeleton h-5 w-14" />
            </div>
        </div>

        <div
            aria-hidden="true"
            className="mt-6 border border-hairline bg-background sm:flex sm:items-center sm:gap-x-8 sm:px-4 sm:py-3"
        >
            <div className="px-4 py-3 sm:min-w-0 sm:flex-1 sm:p-0">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:flex sm:flex-wrap sm:items-baseline">
                    {STAT_LABELS.map((label) => (
                        // h-7 is the line box the real stat's text-lg value
                        // draws in, which is what sets the row's height. The
                        // bars sit on a shared baseline rather than centred,
                        // so the small label reads as text on the same line.
                        <span
                            key={label}
                            className="flex h-7 items-baseline gap-2"
                        >
                            <span className="skeleton h-5 w-6" />
                            <TextBar className="text-xs">{label}</TextBar>
                        </span>
                    ))}
                </div>
            </div>
            <span className="flex h-11 w-full items-center justify-between border-t border-faint px-4 sm:h-8 sm:w-auto sm:shrink-0 sm:justify-start sm:gap-1.5 sm:border-t-0 sm:px-0">
                <TextBar className="text-sm">Insights</TextBar>
                <span className="skeleton size-4 shrink-0" />
            </span>
        </div>

        <section className="mt-4 border border-hairline bg-background">
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-5 py-2 lg:py-0">
                <h2 className="flex items-baseline gap-2 text-xs font-medium text-muted">
                    Applications
                    <span
                        aria-hidden="true"
                        className="skeleton h-3 w-4 self-center"
                    />
                </h2>
                <div
                    aria-hidden="true"
                    className="flex flex-wrap items-center gap-2 max-sm:w-full"
                >
                    {/* Search and filter share a line of their own on a phone,
                        the way the real bar holds them together. */}
                    <div className="flex items-center gap-2 max-sm:w-full">
                        {/* The field yields to the filter button beside it, the
                            way the real one does; holding its full width would
                            push that button off the edge of a phone. */}
                        <span className="skeleton h-8 max-sm:w-full sm:w-52" />
                        <ControlSkeleton label="Filter" />
                    </div>
                    <ControlSkeleton
                        label="Pay currency"
                        className="max-sm:grow sm:w-44"
                    />
                    {viewing ? null : (
                        <ControlSkeleton
                            label="Edit all"
                            className="max-sm:grow"
                        />
                    )}
                    <ControlSkeleton label="Export" className="max-sm:grow" />
                    {viewing ? null : (
                        <>
                            <ControlSkeleton
                                label="Import"
                                className="max-sm:grow"
                            />
                            <ControlSkeleton
                                label="Add application"
                                className="font-medium max-sm:grow"
                            />
                        </>
                    )}
                </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
                <ApplicationsHeaderRow
                    selectAll={
                        viewing ? null : (
                            <span
                                aria-hidden="true"
                                className="skeleton size-3.5"
                            />
                        )
                    }
                />
                <ul aria-hidden="true">
                    {Array.from({ length: 10 }, (_, index) => (
                        <ApplicationRowSkeleton key={index} viewing={viewing} />
                    ))}
                </ul>
            </div>
        </section>
    </div>
);
