import { LIST_PAGE_SIZE } from "@/components/dashboard/data";

// Loading placeholders for the lists index. The row markup mirrors ListRow
// (same padding and line-box heights) and a full page of rows plus the
// pagination bar are rendered, so swapping to real content doesn't resize the
// page or shift the layout.

const SkeletonRow = () => (
    <li className="flex items-stretch border-b border-faint last:border-b-0">
        <div className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
                <div className="flex h-6 items-center gap-3">
                    <span className="skeleton h-3.5 w-40" />
                    <span className="skeleton h-5 w-14" />
                </div>
                <div className="mt-1 flex h-5 items-center">
                    <span className="skeleton h-3 w-64 max-w-full" />
                </div>
            </div>
            <div className="hidden items-center gap-6 sm:flex">
                <span className="skeleton h-3.5 w-24" />
                <span className="skeleton h-3.5 w-14" />
            </div>
        </div>
        <div className="flex shrink-0 items-center px-4">
            <span className="skeleton size-4" />
        </div>
    </li>
);

export const ListRowsSkeleton = ({
    rows = LIST_PAGE_SIZE,
}: {
    rows?: number;
}) => (
    <div aria-hidden="true">
        <ul className="border border-hairline bg-background">
            {Array.from({ length: rows }, (_, index) => (
                <SkeletonRow key={index} />
            ))}
        </ul>
        <div className="mt-4 flex items-center justify-between">
            <span className="skeleton h-4 w-24" />
            <div className="flex items-center gap-2">
                <span className="skeleton h-8 w-24" />
                <span className="skeleton h-8 w-16" />
            </div>
        </div>
    </div>
);

export const ListsPageSkeleton = () => (
    <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Your lists
                </h1>
                <p className="mt-2 text-sm text-sub">
                    Each list tracks a separate set of applications.
                </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <span className="skeleton h-8 w-full sm:w-56" />
                <div className="flex items-center gap-3">
                    <span className="skeleton h-8 w-44" />
                    <span className="skeleton h-8 w-24" />
                </div>
            </div>
        </div>
        <div className="mt-8">
            <ListRowsSkeleton />
        </div>
    </div>
);
