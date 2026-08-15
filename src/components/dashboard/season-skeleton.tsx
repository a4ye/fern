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

const ApplicationRowSkeleton = () => (
    <li
        className={`${APPLICATION_COLUMNS} ${ROW_HEIGHT} border-b border-faint px-5 last:border-b-0`}
    >
        <span className="skeleton size-3.5" />
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

export const SeasonPageSkeleton = () => (
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
                <div className="flex h-8 w-12 shrink-0 items-center justify-end">
                    <span className="p-1">
                        <span className="skeleton block size-4" />
                    </span>
                    <span className="p-1">
                        <span className="skeleton block size-4" />
                    </span>
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
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 px-4 py-3 sm:flex sm:flex-1 sm:flex-wrap sm:items-baseline sm:p-0">
                {Array.from({ length: 4 }, (_, index) => (
                    <span key={index} className="flex h-8 items-baseline gap-2">
                        <span className="skeleton h-5 w-6" />
                        <span className="skeleton h-3 w-16" />
                    </span>
                ))}
            </div>
            <span className="flex h-11 w-full items-center border-t border-faint px-4 sm:h-8 sm:w-auto sm:shrink-0 sm:border-t-0 sm:px-0">
                <span className="skeleton h-4 w-20" />
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
                    <span className="skeleton h-8 shrink-0 max-sm:w-full sm:w-52" />
                    <span className="skeleton h-8 w-20 shrink-0 max-sm:grow" />
                    <span className="skeleton h-8 w-24 shrink-0 max-sm:grow" />
                    <span className="skeleton h-8 w-36 shrink-0 max-sm:grow" />
                </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
                <ApplicationsHeaderRow
                    selectAll={
                        <span
                            aria-hidden="true"
                            className="skeleton size-3.5"
                        />
                    }
                />
                <ul aria-hidden="true">
                    {Array.from({ length: 10 }, (_, index) => (
                        <ApplicationRowSkeleton key={index} />
                    ))}
                </ul>
            </div>
        </section>
    </div>
);
