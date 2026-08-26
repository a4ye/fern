"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    loadListHistory,
    restoreListHistoryVersion,
    undoListHistoryAction,
} from "@/app/dashboard/actions";
import {
    STATUS_META,
    arrangementLabel,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import type {
    HistoryCategory,
    HistoryValueChange,
    HistoryValueToken,
    ListHistoryChange,
    ListHistoryItem,
    ListHistoryPage,
} from "@/db/history";

const TITLE_ID = "list-history-title";

const CATEGORY_ICONS: Record<HistoryCategory, string> = {
    added: "icon-[lucide--plus]",
    edited: "icon-[lucide--pencil]",
    moved: "icon-[lucide--arrow-right-left]",
    deleted: "icon-[lucide--trash-2]",
    reverted: "icon-[lucide--rotate-ccw]",
    restored: "icon-[lucide--history]",
};

const CATEGORY_PLATES: Record<HistoryCategory, string> = {
    added: "bg-accent-tint text-accent-deep",
    edited: "bg-hairline text-sub",
    moved: "bg-accent-tint text-accent-deep",
    deleted: "bg-rose-tint text-rose",
    reverted: "bg-gold-tint text-gold",
    restored: "bg-gold-tint text-gold",
};

const valueLabel = (token: HistoryValueToken): string => {
    if (token.field === "status" && token.value in STATUS_META) {
        return STATUS_META[token.value as ApplicationStatus].label;
    }
    if (
        token.field === "arrangement" &&
        ["remote", "hybrid", "onsite"].includes(token.value)
    ) {
        return arrangementLabel(token.value as Arrangement);
    }
    return token.value;
};

const HistoryValue = ({ token }: { token: HistoryValueToken }) => {
    const status =
        token.field === "status" && token.value in STATUS_META
            ? STATUS_META[token.value as ApplicationStatus]
            : null;
    return (
        <span
            className={`mx-0.5 inline-flex items-center px-1.5 py-0.5 text-xs leading-4 font-medium align-baseline ${status ? status.plate : "bg-accent-tint text-accent-deep"}`}
        >
            {valueLabel(token)}
        </span>
    );
};

const HistoryTitle = ({ item }: { item: ListHistoryItem }) => {
    if (!item.titleValue) return item.title;
    const label = valueLabel(item.titleValue);
    const valueIndex = item.title.lastIndexOf(label);
    if (valueIndex < 0) return item.title;
    return (
        <>
            {item.title.slice(0, valueIndex)}
            <HistoryValue token={item.titleValue} />
            {item.title.slice(valueIndex + label.length)}
        </>
    );
};

const semanticToken = (
    change: HistoryValueChange,
    value: string,
): HistoryValueToken => ({ field: change.field, value });

const HistoryChangeDescription = ({
    change,
}: {
    change: ListHistoryChange;
}) => {
    if (!change.valueChange) return change.description;
    const { before, after, count, field, subject } = change.valueChange;
    const prefix = subject ? `${subject}: ` : "";
    const label = field === "status" ? "Status" : "Arrangement";
    const suffix =
        count > 1 ? ` for ${count.toLocaleString()} applications` : "";
    if (before === null || before === "") {
        return (
            <>
                {prefix}
                {label} set to{" "}
                {after && (
                    <HistoryValue
                        token={semanticToken(change.valueChange, after)}
                    />
                )}
                {suffix}
            </>
        );
    }
    if (after === null || after === "") {
        return (
            <>
                {prefix}
                {label} cleared{suffix}
            </>
        );
    }
    return (
        <>
            {prefix}
            {label} changed from{" "}
            <HistoryValue token={semanticToken(change.valueChange, before)} />{" "}
            to <HistoryValue token={semanticToken(change.valueChange, after)} />
            {suffix}
        </>
    );
};

const groupByDay = (items: ListHistoryItem[]) => {
    const groups = new Map<string, { day: string; items: ListHistoryItem[] }>();
    for (const item of items) {
        const group = groups.get(item.day);
        if (group) group.items.push(item);
        else groups.set(item.day, { day: item.day, items: [item] });
    }
    return [...groups.values()];
};

const quietButtonClass =
    "inline-flex h-10 cursor-pointer items-center px-3 text-xs font-medium text-sub transition-[background-color,color,scale] duration-150 ease-out hover:bg-background hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";

const primaryButtonClass =
    "inline-flex h-10 cursor-pointer items-center bg-accent px-3 text-xs font-semibold text-background transition-[background-color,scale] duration-150 ease-out hover:bg-accent-deep active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";

export const HistoryDialog = ({
    listId,
    initialPage,
    onClose,
}: {
    listId: string;
    initialPage: ListHistoryPage;
    onClose: () => void;
}) => {
    const router = useRouter();
    const { ref: dialogRef, close } = useModalDialog();
    const [items, setItems] = useState(initialPage.items);
    const [cursor, setCursor] = useState(initialPage.nextCursor);
    const [hasMore, setHasMore] = useState(initialPage.hasMore);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [undoing, setUndoing] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [confirmingRestore, setConfirmingRestore] = useState<string | null>(
        null,
    );
    const [isLoading, startLoading] = useTransition();
    const loadedOlder = useRef(false);

    useEffect(() => {
        setItems((current) => {
            if (!loadedOlder.current) return initialPage.items;

            const refreshed = new Set(initialPage.items.map((item) => item.id));
            return [
                ...initialPage.items,
                ...current.filter((item) => !refreshed.has(item.id)),
            ];
        });

        if (!loadedOlder.current) {
            setCursor(initialPage.nextCursor);
            setHasMore(initialPage.hasMore);
        }
    }, [initialPage]);

    const dismiss = () => close(onClose);

    const toggle = (id: string) => {
        setConfirmingRestore(null);
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
            setItems((current) =>
                current.map((currentItem) =>
                    currentItem.id === item.id
                        ? { ...currentItem, canUndo: false, undone: true }
                        : currentItem,
                ),
            );
            toast.success(
                item.reversal === "redo" ? "Change reapplied" : "Change undone",
            );
            router.refresh();
        });
    };

    const restore = (item: ListHistoryItem) => {
        setRestoring(item.id);
        startLoading(async () => {
            const result = await restoreListHistoryVersion(listId, item.id);
            setRestoring(null);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            setConfirmingRestore(null);
            toast.success("Version restored");
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
            loadedOlder.current = true;
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

    const groups = groupByDay(items);

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={TITLE_ID}
            onCancel={(event) => {
                event.preventDefault();
                dismiss();
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) dismiss();
            }}
            className="m-auto max-h-[min(45rem,calc(100dvh-2rem))] w-[calc(100dvw-2rem)] max-w-3xl overflow-hidden border-0 bg-background p-0 shadow-lg backdrop:bg-ink/25 sm:max-h-[min(45rem,calc(100dvh-3rem))] sm:w-[calc(100dvw-3rem)]"
        >
            {/* Keep flex on an inner element so the browser can restore
                dialog:not([open]) to display:none during the closing fade. */}
            <div className="flex max-h-[min(45rem,calc(100dvh-2rem))] min-h-0 flex-col border border-hairline sm:max-h-[min(45rem,calc(100dvh-3rem))]">
                <header className="flex h-14 shrink-0 items-center justify-between gap-5 border-b border-hairline px-5 sm:px-6">
                    <h2
                        id={TITLE_ID}
                        className="text-base font-semibold text-balance text-ink"
                    >
                        History
                    </h2>
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Close history"
                        title="Close"
                        className="flex size-10 shrink-0 cursor-pointer items-center justify-center text-muted transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--x] block size-4"
                        />
                    </button>
                </header>

                {items.length === 0 ? (
                    <div className="grid min-h-0 flex-1 place-items-center px-6 py-12 text-center">
                        <div>
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--history] mx-auto block size-5 text-muted"
                            />
                            <p className="mt-3 text-sm text-sub">
                                Changes will appear here.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5 sm:py-6">
                        <div className="space-y-7">
                            {groups.map((group) => (
                                <section key={group.day}>
                                    <div className="flex items-center gap-3 px-3">
                                        <h3 className="shrink-0 text-xs font-medium text-sub tabular-nums">
                                            {group.day}
                                        </h3>
                                        <span
                                            aria-hidden="true"
                                            className="h-px flex-1 bg-faint"
                                        />
                                    </div>
                                    <ol className="mt-2 space-y-1">
                                        {group.items.map((item) => {
                                            const isExpanded = expanded.has(
                                                item.id,
                                            );
                                            const detailsId = `history-details-${item.id}`;
                                            const hasDetails =
                                                item.changes.length > 0 ||
                                                item.undone ||
                                                item.canUndo ||
                                                item.canRestore ||
                                                item.restoreTarget !== null;
                                            const isConfirming =
                                                confirmingRestore === item.id;

                                            return (
                                                <li
                                                    key={item.id}
                                                    className={`border-l-2 ${isExpanded ? "border-accent bg-surface" : "border-transparent"}`}
                                                >
                                                    <button
                                                        type="button"
                                                        disabled={!hasDetails}
                                                        onClick={() =>
                                                            hasDetails &&
                                                            toggle(item.id)
                                                        }
                                                        aria-expanded={
                                                            hasDetails
                                                                ? isExpanded
                                                                : undefined
                                                        }
                                                        aria-controls={
                                                            hasDetails
                                                                ? detailsId
                                                                : undefined
                                                        }
                                                        className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-[background-color] duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:hover:bg-transparent"
                                                    >
                                                        <span
                                                            aria-hidden="true"
                                                            className={`flex size-8 shrink-0 items-center justify-center ${CATEGORY_PLATES[item.category]}`}
                                                        >
                                                            <span
                                                                className={`${CATEGORY_ICONS[item.category]} block size-4`}
                                                            />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span
                                                                className={`block text-pretty text-sm leading-5 ${isExpanded ? "font-semibold" : "font-medium"} ${item.undone ? "text-sub" : "text-ink"}`}
                                                            >
                                                                <HistoryTitle
                                                                    item={item}
                                                                />
                                                            </span>
                                                            <span className="mt-0.5 block text-xs text-muted tabular-nums">
                                                                {item.undone
                                                                    ? "Reverted, "
                                                                    : ""}
                                                                {item.when},{" "}
                                                                <time
                                                                    dateTime={
                                                                        item.occurredAt
                                                                    }
                                                                >
                                                                    {item.time}
                                                                </time>
                                                            </span>
                                                        </span>
                                                        {hasDetails && (
                                                            <span
                                                                aria-hidden="true"
                                                                className={`icon-[lucide--chevron-right] block size-4 shrink-0 text-muted transition-transform duration-150 ease-out ${isExpanded ? "rotate-90" : ""}`}
                                                            />
                                                        )}
                                                    </button>

                                                    {isExpanded && (
                                                        <div
                                                            id={detailsId}
                                                            className="pr-4 pb-5 pl-14 sm:pr-5"
                                                        >
                                                            {item.restoreTarget && (
                                                                <div className="border-y border-hairline py-3">
                                                                    <p className="text-xs text-muted">
                                                                        Restored
                                                                        to
                                                                    </p>
                                                                    <p className="mt-1 text-pretty text-sm leading-5 font-medium text-ink">
                                                                        {
                                                                            item
                                                                                .restoreTarget
                                                                                .title
                                                                        }
                                                                    </p>
                                                                    <p className="mt-0.5 text-xs text-sub tabular-nums">
                                                                        <time
                                                                            dateTime={
                                                                                item
                                                                                    .restoreTarget
                                                                                    .occurredAt
                                                                            }
                                                                        >
                                                                            {
                                                                                item
                                                                                    .restoreTarget
                                                                                    .day
                                                                            }{" "}
                                                                            at{" "}
                                                                            {
                                                                                item
                                                                                    .restoreTarget
                                                                                    .time
                                                                            }
                                                                        </time>
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {item.changes
                                                                .length > 0 ? (
                                                                <div className="mt-4">
                                                                    <p className="text-xs font-semibold text-sub">
                                                                        What
                                                                        changed
                                                                    </p>
                                                                    <ul className="mt-2 divide-y divide-faint border-y border-faint">
                                                                        {item.changes.map(
                                                                            (
                                                                                change,
                                                                                index,
                                                                            ) => (
                                                                                <li
                                                                                    key={`${item.id}-${index}`}
                                                                                    className={`text-pretty text-xs leading-5 text-sub ${change.applications.length > 1 ? "" : "py-2.5"}`}
                                                                                >
                                                                                    {change
                                                                                        .applications
                                                                                        .length >
                                                                                    1 ? (
                                                                                        <details className="group/change">
                                                                                            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 px-2 transition-[background-color] duration-150 ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                                                                                                <span className="min-w-0 flex-1">
                                                                                                    <HistoryChangeDescription
                                                                                                        change={
                                                                                                            change
                                                                                                        }
                                                                                                    />
                                                                                                </span>
                                                                                                <span className="shrink-0 text-muted">
                                                                                                    View
                                                                                                    applications
                                                                                                </span>
                                                                                                <span
                                                                                                    aria-hidden="true"
                                                                                                    className="icon-[lucide--chevron-right] block size-3.5 shrink-0 text-muted transition-transform duration-150 ease-out group-open/change:rotate-90"
                                                                                                />
                                                                                            </summary>
                                                                                            <ul className="grid max-h-48 gap-x-5 gap-y-1 overflow-y-auto overscroll-contain border-l border-hairline py-2 pr-3 pl-3 sm:grid-cols-2">
                                                                                                {change.applications.map(
                                                                                                    (
                                                                                                        application,
                                                                                                        applicationIndex,
                                                                                                    ) => (
                                                                                                        <li
                                                                                                            key={`${item.id}-${index}-${applicationIndex}`}
                                                                                                            className="min-w-0 truncate"
                                                                                                            title={
                                                                                                                application
                                                                                                            }
                                                                                                        >
                                                                                                            {
                                                                                                                application
                                                                                                            }
                                                                                                        </li>
                                                                                                    ),
                                                                                                )}
                                                                                                {change.applicationCount >
                                                                                                    change
                                                                                                        .applications
                                                                                                        .length && (
                                                                                                    <li className="text-muted tabular-nums">
                                                                                                        and{" "}
                                                                                                        {(
                                                                                                            change.applicationCount -
                                                                                                            change
                                                                                                                .applications
                                                                                                                .length
                                                                                                        ).toLocaleString()}{" "}
                                                                                                        more
                                                                                                    </li>
                                                                                                )}
                                                                                            </ul>
                                                                                        </details>
                                                                                    ) : (
                                                                                        <HistoryChangeDescription
                                                                                            change={
                                                                                                change
                                                                                            }
                                                                                        />
                                                                                    )}
                                                                                </li>
                                                                            ),
                                                                        )}
                                                                    </ul>
                                                                </div>
                                                            ) : (
                                                                !item.restoreTarget && (
                                                                    <p className="mt-3 text-xs leading-5 text-sub">
                                                                        {item.undone
                                                                            ? "This change was reverted."
                                                                            : item.category ===
                                                                                "reverted"
                                                                              ? "Details for the original change are no longer available."
                                                                              : "No additional details are available."}
                                                                    </p>
                                                                )
                                                            )}

                                                            {item.undone &&
                                                                item.changes
                                                                    .length >
                                                                    0 && (
                                                                    <p className="mt-3 text-xs text-muted">
                                                                        This
                                                                        change
                                                                        was
                                                                        reverted.
                                                                    </p>
                                                                )}

                                                            {(item.canUndo ||
                                                                item.canRestore) && (
                                                                <div className="mt-4 flex min-h-13 items-center justify-end gap-1 border-t border-hairline pt-3">
                                                                    {isConfirming ? (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    setConfirmingRestore(
                                                                                        null,
                                                                                    )
                                                                                }
                                                                                disabled={
                                                                                    isLoading
                                                                                }
                                                                                className={
                                                                                    quietButtonClass
                                                                                }
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    restore(
                                                                                        item,
                                                                                    )
                                                                                }
                                                                                disabled={
                                                                                    isLoading
                                                                                }
                                                                                className={
                                                                                    primaryButtonClass
                                                                                }
                                                                            >
                                                                                {restoring ===
                                                                                item.id
                                                                                    ? "Restoring..."
                                                                                    : "Restore"}
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            {item.canUndo && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        undo(
                                                                                            item,
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        isLoading
                                                                                    }
                                                                                    className={
                                                                                        quietButtonClass
                                                                                    }
                                                                                >
                                                                                    {undoing ===
                                                                                    item.id
                                                                                        ? item.reversal ===
                                                                                          "redo"
                                                                                            ? "Redoing..."
                                                                                            : "Undoing..."
                                                                                        : item.reversal ===
                                                                                            "redo"
                                                                                          ? "Redo"
                                                                                          : "Undo"}
                                                                                </button>
                                                                            )}
                                                                            {item.canRestore && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        setConfirmingRestore(
                                                                                            item.id,
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        isLoading
                                                                                    }
                                                                                    className={
                                                                                        quietButtonClass
                                                                                    }
                                                                                >
                                                                                    Restore
                                                                                    to
                                                                                    this
                                                                                    point
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </section>
                            ))}
                        </div>

                        {hasMore && (
                            <div className="mt-8 border-t border-hairline pt-4">
                                <button
                                    type="button"
                                    onClick={loadOlder}
                                    disabled={isLoading}
                                    className="h-11 w-full cursor-pointer text-xs font-medium text-sub transition-[background-color,color,scale] duration-150 ease-out hover:bg-surface hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                                >
                                    {isLoading &&
                                    undoing === null &&
                                    restoring === null
                                        ? "Loading..."
                                        : "Load older changes"}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </dialog>
    );
};
