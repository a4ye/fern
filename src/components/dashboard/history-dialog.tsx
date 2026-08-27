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
    PAY_PERIODS,
    STATUS_META,
    arrangementLabel,
    formatDay,
    formatPay,
    payPeriodLabel,
    type ApplicationStatus,
    type Arrangement,
    type PayPeriod,
} from "@/components/dashboard/data";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import type {
    HistoryCategory,
    HistoryFieldChange,
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

const PAY_AMOUNT_CODES = ["mi", "ma", "b"];

const formattedFieldValue = (
    change: HistoryFieldChange,
    value: string | null,
    currency: string | null | undefined,
    defaultCurrency: string,
): string => {
    if (value === null || value === "") return "Not set";
    if (PAY_AMOUNT_CODES.includes(change.code)) {
        return (
            formatPay({
                payMin: value,
                payMax: null,
                payCurrency: currency || defaultCurrency,
                payPeriod: null,
                payNote: null,
            }) ?? value
        );
    }
    if (change.code === "pe" && PAY_PERIODS.includes(value as PayPeriod)) {
        return payPeriodLabel(value as PayPeriod);
    }
    if (change.code === "d" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return formatDay(value);
    }
    return value.replace(/\s+/g, " ");
};

const HistoryFieldValue = ({
    change,
    value,
    currency,
    defaultCurrency,
    current,
}: {
    change: HistoryFieldChange;
    value: string | null;
    currency: string | null | undefined;
    defaultCurrency: string;
    current: boolean;
}) => {
    const empty = value === null || value === "";
    return (
        <span
            className={`inline-flex min-h-7 max-w-full items-center px-2 py-1 text-xs leading-5 ${PAY_AMOUNT_CODES.includes(change.code) ? "tabular-nums" : ""} ${change.code === "u" ? "break-all" : "break-words"} ${current ? "bg-accent-tint text-accent-deep font-medium" : empty ? "bg-faint text-muted" : "bg-hairline text-sub"}`}
        >
            {formattedFieldValue(change, value, currency, defaultCurrency)}
        </span>
    );
};

const HistoryFieldChangeRow = ({
    change,
    defaultCurrency,
}: {
    change: HistoryFieldChange;
    defaultCurrency: string;
}) => (
    <div className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center sm:gap-4">
        <span className="font-semibold text-ink">{change.label}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
            <HistoryFieldValue
                change={change}
                value={change.before}
                currency={change.currencyBefore}
                defaultCurrency={defaultCurrency}
                current={false}
            />
            <span
                aria-hidden="true"
                className="icon-[lucide--arrow-right] block size-3.5 shrink-0 text-muted"
            />
            <HistoryFieldValue
                change={change}
                value={change.after}
                currency={change.currencyAfter}
                defaultCurrency={defaultCurrency}
                current
            />
            {change.count > 1 && (
                <span className="ml-auto shrink-0 text-muted tabular-nums">
                    {change.count.toLocaleString()} applications
                </span>
            )}
        </span>
    </div>
);

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

const HistoryChangeDetail = ({
    change,
    defaultCurrency,
}: {
    change: ListHistoryChange;
    defaultCurrency: string;
}) =>
    change.fieldChange ? (
        <HistoryFieldChangeRow
            change={change.fieldChange}
            defaultCurrency={defaultCurrency}
        />
    ) : (
        <HistoryChangeDescription change={change} />
    );

const ApplicationList = ({
    applications,
    count,
    label,
    keyPrefix,
}: {
    applications: string[];
    count: number;
    label: string;
    keyPrefix: string;
}) => {
    const shown = applications.length;
    return (
        <div>
            <div className="flex min-h-9 items-center gap-2 border-b border-hairline px-1">
                <span
                    aria-hidden="true"
                    className="icon-[lucide--briefcase-business] block size-3.5 shrink-0 text-muted"
                />
                <span className="font-medium text-ink">{label}</span>
                <span className="ml-auto shrink-0 text-muted tabular-nums">
                    {shown < count
                        ? `${shown.toLocaleString()} of ${count.toLocaleString()} shown`
                        : count.toLocaleString()}
                </span>
            </div>
            <ul className="grid max-h-48 gap-x-6 overflow-y-auto overscroll-contain sm:grid-cols-2">
                {applications.map((application, index) => (
                    <li
                        key={`${keyPrefix}-${index}`}
                        title={application}
                        className="flex min-h-10 min-w-0 items-center gap-2.5 border-b border-faint px-1 py-2"
                    >
                        <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center bg-hairline text-xs font-medium text-sub"
                        >
                            {application.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 truncate text-ink">
                            {application}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
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
    defaultCurrency,
    onClose,
}: {
    listId: string;
    initialPage: ListHistoryPage;
    defaultCurrency: string;
    onClose: () => void;
}) => {
    const router = useRouter();
    const { ref: dialogRef, close } = useModalDialog();
    const [items, setItems] = useState(initialPage.items);
    const [cursor, setCursor] = useState(initialPage.nextCursor);
    const [hasMore, setHasMore] = useState(initialPage.hasMore);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [undoing, setUndoing] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [confirmingRestore, setConfirmingRestore] = useState<string | null>(
        null,
    );
    const [isLoading, startLoading] = useTransition();
    const loadedOlder = useRef(false);
    const historyScrollRef = useRef<HTMLDivElement>(null);

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

    const keepTriggerInPlace = (trigger: HTMLElement) => {
        const scroller = historyScrollRef.current;
        if (!scroller) return;
        const top = trigger.getBoundingClientRect().top;
        requestAnimationFrame(() => {
            if (!trigger.isConnected) return;
            scroller.scrollTop += trigger.getBoundingClientRect().top - top;
        });
    };

    const toggle = (id: string, trigger: HTMLElement) => {
        keepTriggerInPlace(trigger);
        setConfirmingRestore(null);
        setExpanded((current) => (current === id ? null : id));
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
            className="m-auto h-[min(45rem,calc(100dvh-2rem))] w-[calc(100dvw-2rem)] max-w-3xl overflow-hidden border-0 bg-background p-0 shadow-lg backdrop:bg-ink/25 sm:h-[min(45rem,calc(100dvh-3rem))] sm:w-[calc(100dvw-3rem)]"
        >
            {/* Keep flex on an inner element so the browser can restore
                dialog:not([open]) to display:none during the closing fade. */}
            <div className="flex h-full min-h-0 flex-col border border-hairline">
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
                    <div
                        ref={historyScrollRef}
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 [overflow-anchor:none] sm:px-5 sm:py-6"
                    >
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
                                            const isExpanded =
                                                expanded === item.id;
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
                                                    className={
                                                        isExpanded
                                                            ? "bg-surface"
                                                            : ""
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        disabled={!hasDetails}
                                                        onClick={(event) =>
                                                            hasDetails &&
                                                            toggle(
                                                                item.id,
                                                                event.currentTarget,
                                                            )
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
                                                                                    className={`text-pretty text-xs leading-5 text-sub ${change.applicationList || change.applications.length > 0 ? "py-2" : "py-2.5"}`}
                                                                                >
                                                                                    {change.applicationList ? (
                                                                                        <ApplicationList
                                                                                            applications={
                                                                                                change.applications
                                                                                            }
                                                                                            count={
                                                                                                change.applicationCount
                                                                                            }
                                                                                            label={
                                                                                                change.applicationCount ===
                                                                                                1
                                                                                                    ? "Application"
                                                                                                    : "Applications"
                                                                                            }
                                                                                            keyPrefix={`${item.id}-${index}`}
                                                                                        />
                                                                                    ) : change
                                                                                          .applications
                                                                                          .length >
                                                                                      0 ? (
                                                                                        <details className="group/change">
                                                                                            <summary
                                                                                                onClick={(
                                                                                                    event,
                                                                                                ) =>
                                                                                                    keepTriggerInPlace(
                                                                                                        event.currentTarget,
                                                                                                    )
                                                                                                }
                                                                                                className="flex min-h-10 cursor-pointer list-none items-center gap-3 px-2 transition-[background-color] duration-150 ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
                                                                                            >
                                                                                                <div className="min-w-0 flex-1">
                                                                                                    <HistoryChangeDetail
                                                                                                        change={
                                                                                                            change
                                                                                                        }
                                                                                                        defaultCurrency={
                                                                                                            defaultCurrency
                                                                                                        }
                                                                                                    />
                                                                                                </div>
                                                                                                <span className="shrink-0 text-muted">
                                                                                                    View
                                                                                                    applications
                                                                                                </span>
                                                                                                <span
                                                                                                    aria-hidden="true"
                                                                                                    className="icon-[lucide--chevron-right] block size-3.5 shrink-0 text-muted transition-transform duration-150 ease-out group-open/change:rotate-90"
                                                                                                />
                                                                                            </summary>
                                                                                            <ApplicationList
                                                                                                applications={
                                                                                                    change.applications
                                                                                                }
                                                                                                count={
                                                                                                    change.applicationCount
                                                                                                }
                                                                                                label="Affected applications"
                                                                                                keyPrefix={`${item.id}-${index}`}
                                                                                            />
                                                                                        </details>
                                                                                    ) : (
                                                                                        <HistoryChangeDetail
                                                                                            change={
                                                                                                change
                                                                                            }
                                                                                            defaultCurrency={
                                                                                                defaultCurrency
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
