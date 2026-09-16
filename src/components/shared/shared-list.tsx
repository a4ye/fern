import type { ReactNode } from "react";
import Image from "next/image";
import { LocalDateTime } from "@/components/dashboard/local-date-time";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { SharedTable } from "@/components/shared/shared-table";
import type { SharedList as SharedListData } from "@/db/shares";
import type { ExchangeRates } from "@/lib/exchange";
import { formatDay } from "@/components/dashboard/data";

// One list as somebody who did not write it reads it. Both doors into a shared
// list end here: a public link, and a friend opening it from their own
// dashboard. The page above decides whether the reader is allowed in; this
// only draws what they were let in to see.
export const SharedList = ({
    list,
    rates,
    back,
}: {
    list: SharedListData;
    rates: ExchangeRates;
    // The way out, which differs by door: a friend came from their own lists,
    // and somebody holding a link came from outside the app and has none.
    back?: ReactNode;
}) => (
    <div className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10 sm:px-10">
        {back}
        <div className={`min-w-0 ${back ? "mt-4" : ""}`}>
            <h1 className="truncate text-2xl font-semibold tracking-tight">
                {list.name}
            </h1>
            {list.description && (
                <p className="mt-2 truncate text-sm text-sub">
                    {list.description}
                </p>
            )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-sub">
                {list.owner.image && (
                    <Image
                        src={list.owner.image}
                        alt=""
                        width={20}
                        height={20}
                        className="size-5 shrink-0"
                    />
                )}
                <span className="truncate">Shared by {list.owner.name}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-hairline px-2 py-0.5 text-xs font-medium text-sub">
                <span
                    aria-hidden="true"
                    className="icon-[lucide--eye] size-3.5"
                />
                Read only
            </span>
            {/* A link with an end on it says so, so nobody discovers the date
                by finding the page gone. Server-rendered as the UTC day and
                swapped for the reader's own once the browser has it. */}
            {list.expiresAt && (
                <span className="text-xs text-muted">
                    Link expires{" "}
                    <LocalDateTime
                        dateTime={list.expiresAt}
                        display="date"
                        interactive={false}
                    >
                        {formatDay(list.expiresAt.slice(0, 10))}
                    </LocalDateTime>
                </span>
            )}
        </div>

        <div className="mt-6 border border-hairline bg-background px-5 py-4">
            <StatStrip stats={list.stats} />
        </div>

        <div className="mt-4">
            <SharedTable
                name={list.name}
                applications={list.applications}
                rates={rates}
            />
        </div>
    </div>
);
