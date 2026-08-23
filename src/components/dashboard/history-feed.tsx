"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    loadListHistory,
    undoListHistoryAction,
} from "@/app/dashboard/actions";
import type { ListHistoryItem, ListHistoryPage } from "@/db/history";

export const HistoryFeed = ({
    listId,
    initialPage,
}: {
    listId: string;
    initialPage: ListHistoryPage;
}) => {
    const router = useRouter();
    const [items, setItems] = useState(initialPage.items);
    const [cursor, setCursor] = useState(initialPage.nextCursor);
    const [hasMore, setHasMore] = useState(initialPage.hasMore);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [undoing, setUndoing] = useState<string | null>(null);
    const [isLoading, startLoading] = useTransition();

    const toggle = (id: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const undo = (item: ListHistoryItem) => {
        setUndoing(item.id);
        startLoading(async () => {
            const result = await undoListHistoryAction(listId, item.id);
            setUndoing(null);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            toast.success("Change undone");
            router.refresh();
        });
    };

    const loadOlder = () => {
        if (!cursor) return;
        startLoading(async () => {
            const page = await loadListHistory(listId, cursor);
            if (!page) {
                toast.error("Could not load older history.");
                return;
            }
            setItems((current) => {
                const known = new Set(current.map((item) => item.id));
                return [
                    ...current,
                    ...page.items.filter((item) => !known.has(item.id)),
                ];
            });
            setCursor(page.nextCursor);
            setHasMore(page.hasMore);
        });
    };

    return (
        <section className="border border-hairline bg-background">
            <div className="flex h-10 items-center justify-between border-b border-hairline px-4">
                <h2 className="text-xs font-medium text-muted">History</h2>
                <span className="text-xs text-muted">Grouped by action</span>
            </div>
            {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    Changes will appear here.
                </p>
            ) : (
                <ol className="max-h-96 overflow-y-auto overscroll-contain">
                    {items.map((item) => {
                        const isExpanded = expanded.has(item.id);
                        return (
                            <li
                                key={item.id}
                                className="border-b border-faint last:border-b-0"
                            >
                                <div className="flex min-h-12 items-center gap-2 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggle(item.id)}
                                        aria-expanded={isExpanded}
                                        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`icon-[lucide--chevron-right] size-3.5 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span
                                                className={`block truncate text-sm ${item.undone ? "text-muted line-through" : "text-ink"}`}
                                            >
                                                {item.title}
                                            </span>
                                            <span
                                                className="block text-xs text-muted tabular-nums"
                                                title={new Date(
                                                    item.occurredAt,
                                                ).toLocaleString()}
                                            >
                                                {item.when}
                                            </span>
                                        </span>
                                    </button>
                                    {item.canUndo && (
                                        <button
                                            type="button"
                                            onClick={() => undo(item)}
                                            disabled={isLoading}
                                            className="h-11 shrink-0 cursor-pointer px-2 text-xs font-medium text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                                        >
                                            {undoing === item.id
                                                ? "Undoing..."
                                                : "Undo"}
                                        </button>
                                    )}
                                </div>
                                {isExpanded && (
                                    <div className="border-t border-faint bg-surface px-10 py-3">
                                        {item.changes.length > 0 ? (
                                            <ul className="space-y-1.5">
                                                {item.changes.map(
                                                    (change, index) => (
                                                        <li
                                                            key={`${item.id}-${index}`}
                                                            className="text-wrap text-xs leading-5 text-sub"
                                                        >
                                                            {change}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-sub">
                                                {item.archived
                                                    ? "Stored in a compressed PostgreSQL archive."
                                                    : "This action has no field-level details."}
                                            </p>
                                        )}
                                        {(item.archived || item.undone) && (
                                            <p className="mt-2 text-xs text-muted">
                                                {item.archived
                                                    ? "Archived changes are view-only."
                                                    : "This change was undone."}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
            {hasMore && (
                <div className="border-t border-hairline p-2">
                    <button
                        type="button"
                        onClick={loadOlder}
                        disabled={isLoading}
                        className="h-11 w-full cursor-pointer text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                    >
                        {isLoading && undoing === null
                            ? "Loading..."
                            : "Load older history"}
                    </button>
                </div>
            )}
        </section>
    );
};
