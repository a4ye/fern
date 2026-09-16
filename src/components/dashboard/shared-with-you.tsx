import Image from "next/image";
import Link from "next/link";
import { LocalDateTime } from "@/components/dashboard/local-date-time";
import {
    LIST_ROW_MAIN,
    LIST_ROW_META,
} from "@/components/dashboard/list-row-layout";
import { formatEdited } from "@/components/dashboard/data";
import type { SharedListSummary } from "@/db/shares";

// Lists somebody else wrote and let this account read. Drawn on the same row as
// the account's own lists so the page reads as one column, with the owner in
// place of the status plate: whose list it is, is the thing that separates
// these from the ones above.
export const SharedWithYou = ({ lists }: { lists: SharedListSummary[] }) => {
    if (lists.length === 0) return null;

    return (
        <section>
            <h2 className="text-xs font-medium text-muted">Shared with you</h2>
            <ul className="mt-3 border border-hairline bg-background">
                {lists.map((list) => (
                    <li
                        key={list.id}
                        className="flex items-stretch border-b border-faint last:border-b-0"
                    >
                        <Link
                            href={`/dashboard/shared/${list.id}`}
                            className={`${LIST_ROW_MAIN} transition-colors hover:bg-surface`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex h-6 items-center gap-3">
                                    <span className="truncate text-base font-medium text-ink">
                                        {list.name}
                                    </span>
                                    <span className="inline-flex shrink-0 items-center gap-1.5 bg-hairline px-2 py-0.5 text-xs font-medium text-sub">
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--eye] size-3"
                                        />
                                        Read only
                                    </span>
                                </div>
                                <p className="mt-1 flex h-5 items-center gap-2 truncate text-sm text-sub">
                                    {list.owner.image && (
                                        <Image
                                            src={list.owner.image}
                                            alt=""
                                            width={16}
                                            height={16}
                                            className="size-4 shrink-0"
                                        />
                                    )}
                                    <span className="truncate">
                                        {list.owner.name}
                                    </span>
                                </p>
                            </div>
                            <div className={LIST_ROW_META}>
                                <span className="truncate text-right tabular-nums">
                                    {list.totalApplications} applications
                                </span>
                                <span className="truncate text-right text-muted">
                                    Edited{" "}
                                    <LocalDateTime
                                        dateTime={list.updatedAt}
                                        display="date"
                                        interactive={false}
                                    >
                                        {formatEdited(list.updatedAt)}
                                    </LocalDateTime>
                                </span>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};
