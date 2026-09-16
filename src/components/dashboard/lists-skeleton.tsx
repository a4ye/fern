import { LIST_PAGE_SIZE } from "@/components/dashboard/data";
import { EmailSyncSkeleton } from "@/components/dashboard/email-sync-skeleton";
import {
    LIST_ROW_ACTION,
    LIST_ROW_MAIN,
    LIST_ROW_META,
    LIST_ROW_PIN_ACTION,
} from "@/components/dashboard/list-row-layout";

// Loading placeholders for the lists index. The row markup mirrors ListRow
// (same padding and line-box heights) and a full page of rows plus the
// pagination bar are rendered, so swapping to real content doesn't resize the
// page or shift the layout.

const SkeletonRow = () => (
    <li className="flex items-stretch border-b border-faint last:border-b-0">
        <div className={LIST_ROW_MAIN}>
            <div className="min-w-0 flex-1">
                <div className="flex h-6 items-center gap-3">
                    <span className="skeleton h-3.5 w-40" />
                    <span className="skeleton h-5 w-14" />
                </div>
                <div className="mt-1 flex h-5 items-center">
                    <span className="skeleton h-3 w-64 max-w-full" />
                </div>
            </div>
            <div className={LIST_ROW_META}>
                <span className="skeleton h-3.5 w-24 justify-self-end" />
                <span className="skeleton h-3.5 w-28 justify-self-end" />
            </div>
        </div>
        <div className={LIST_ROW_ACTION}>
            <span className="skeleton size-4" />
        </div>
        <div className={LIST_ROW_ACTION}>
            <span className="skeleton size-4" />
        </div>
        <div className={LIST_ROW_PIN_ACTION}>
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

export const ListsPageSkeleton = ({
    hasInboxSync,
}: {
    hasInboxSync: boolean;
}) => (
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
                    {hasInboxSync ? <EmailSyncSkeleton /> : null}
                    <span className="skeleton inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap">
                        <span className="size-4 shrink-0" />
                        <span className="invisible">New list</span>
                    </span>
                </div>
            </div>
        </div>
        <div className="mt-8">
            <ListRowsSkeleton />
        </div>
    </div>
);
