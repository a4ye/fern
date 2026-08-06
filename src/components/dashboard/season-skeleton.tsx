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

        <div aria-hidden="true" className="mt-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
                <span className="skeleton block h-8 w-64 max-w-full" />
                <span className="mt-2 flex h-5 items-center">
                    <span className="skeleton h-3.5 w-96 max-w-full" />
                </span>
                <span className="skeleton mt-2 block h-5 w-16" />
            </div>
            <div className="mt-1 flex shrink-0 items-center gap-2 p-1">
                <span className="skeleton size-4" />
                <span className="skeleton size-4" />
            </div>
        </div>

        <div
            aria-hidden="true"
            className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border border-hairline bg-background px-4 py-3"
        >
            {Array.from({ length: 4 }, (_, index) => (
                <span key={index} className="flex h-8 items-baseline gap-2">
                    <span className="skeleton h-5 w-6" />
                    <span className="skeleton h-3 w-16" />
                </span>
            ))}
            <span className="skeleton ml-auto h-4 w-20" />
        </div>

        <section className="mt-4 border border-hairline bg-background">
            <div className="flex h-12 items-center justify-between gap-4 border-b border-hairline px-5">
                <h2 className="flex items-baseline gap-2 text-xs font-medium text-muted">
                    Applications
                    <span
                        aria-hidden="true"
                        className="skeleton h-3 w-4 self-center"
                    />
                </h2>
                <div aria-hidden="true" className="flex items-center gap-2">
                    <span className="skeleton h-8 w-24" />
                    <span className="skeleton h-8 w-36" />
                </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
                <ApplicationsHeaderRow
                    selectAll={
                        <span aria-hidden="true" className="skeleton size-3.5" />
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
