"use client";

import {
    type ReactNode,
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    clearListHistory,
    loadListHistory,
    loadListHistoryApplications,
    loadListHistoryChanges,
    permanentlyRemoveDeletedApplication,
    restoreListHistoryVersion,
    undoListHistoryAction,
} from "@/app/dashboard/actions";
import {
    LIST_STATUS_META,
    PAY_PERIODS,
    STATUS_META,
    arrangementLabel,
    formatDay,
    formatPay,
    payPeriodLabel,
    type ApplicationStatus,
    type Arrangement,
    type ListStatus,
    type PayPeriod,
} from "@/components/dashboard/data";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useLocalDateTimeFormatter } from "@/components/dashboard/local-date-time";
import { currencyCountry } from "@/lib/pay";
import {
    HISTORY_APPLICATIONS_PAGE_SIZE,
    HISTORY_CHANGES_PAGE_SIZE,
    HISTORY_CHANGES_PREVIEW_SIZE,
    type HistoryApplicationDetail,
} from "@/lib/history-pagination";
import {
    type LocalDateTimeLabels,
    type LocalDateTimeFormatter,
} from "@/lib/local-date-time";
import type {
    HistoryCategory,
    HistoryFieldChange,
    HistoryStatusEntryChange,
    HistorySummaryChange,
    HistoryValueChange,
    HistoryValueToken,
    ListHistoryChange,
    ListHistoryItem,
    ListHistoryPage,
} from "@/db/history";

const TITLE_ID = "list-history-title";
const HISTORY_VALUE_CLASS =
    "inline-flex max-w-full items-center px-1.5 py-0.5 text-xs leading-4 font-medium";

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
            className={`${HISTORY_VALUE_CLASS} align-baseline ${status ? status.plate : "bg-accent-tint text-accent-deep"}`}
        >
            {valueLabel(token)}
        </span>
    );
};

const EmptyHistoryValue = () => (
    <span className={`${HISTORY_VALUE_CLASS} bg-faint text-muted`}>
        Not set
    </span>
);

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
    if (
        change.scope === "list" &&
        change.code === "s" &&
        value in LIST_STATUS_META
    ) {
        return LIST_STATUS_META[value as ListStatus].label;
    }
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
    const currencyCode = empty
        ? null
        : change.code === "cu"
          ? value
          : PAY_AMOUNT_CODES.includes(change.code)
            ? (currency ?? defaultCurrency)
            : null;
    const country =
        currencyCode && /^[A-Z]{3}$/.test(currencyCode)
            ? currencyCountry(currencyCode)
            : null;
    const listStatus =
        change.scope === "list" &&
        change.code === "s" &&
        value &&
        value in LIST_STATUS_META
            ? LIST_STATUS_META[value as ListStatus]
            : null;
    return (
        <span
            className={`${HISTORY_VALUE_CLASS} justify-self-start ${country ? "gap-1.5" : ""} ${PAY_AMOUNT_CODES.includes(change.code) ? "tabular-nums" : ""} ${change.code === "u" ? "break-all" : "break-words"} ${listStatus ? listStatus.plate : empty ? "bg-faint text-muted" : current ? "bg-accent-tint text-accent-deep" : "bg-hairline text-sub"}`}
        >
            {country && (
                // Flags are tiny local SVGs, so image optimisation would add
                // more work than it removes.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`/flags/${country}.svg`}
                    alt=""
                    loading="lazy"
                    className="size-4 shrink-0"
                />
            )}
            {formattedFieldValue(change, value, currency, defaultCurrency)}
        </span>
    );
};

const HistoryStructuredRow = ({
    subject,
    label,
    children,
    reserveSubjectSpace = false,
}: {
    subject: string | null;
    label: string;
    children: ReactNode;
    reserveSubjectSpace?: boolean;
}) => {
    const hasSubjectColumn = subject !== null || reserveSubjectSpace;
    return (
        <div
            className={`grid min-w-0 items-start gap-x-4 gap-y-2 ${hasSubjectColumn ? "sm:grid-cols-[9rem_minmax(0,1fr)]" : ""}`}
        >
            {hasSubjectColumn &&
                (subject ? (
                    <span className="min-w-0 text-pretty break-words font-medium text-ink">
                        {subject}
                    </span>
                ) : (
                    <span aria-hidden="true" className="hidden sm:block" />
                ))}
            <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
                <span className="pt-0.5 text-muted">{label}</span>
                <div className="min-w-0">{children}</div>
            </div>
        </div>
    );
};

const HistoryFieldChangeRow = ({
    change,
    defaultCurrency,
    showCount = true,
    showSubject = true,
    reserveSubjectSpace = false,
}: {
    change: HistoryFieldChange;
    defaultCurrency: string;
    showCount?: boolean;
    showSubject?: boolean;
    reserveSubjectSpace?: boolean;
}) => {
    const beforeEmpty = change.before === null || change.before === "";
    const afterEmpty = change.after === null || change.after === "";
    const isTextField =
        (change.scope === "application" &&
            (change.code === "n" || change.code === "pn")) ||
        (change.scope === "list" && change.code === "d");
    const isLinkField = change.scope === "application" && change.code === "u";
    const subject = showSubject ? change.subject : null;
    const textValue = (value: string | null) => (
        <p className="min-w-0 max-w-full bg-faint px-3 py-2 text-pretty whitespace-pre-wrap break-words text-ink">
            {value}
        </p>
    );
    const linkValue = (value: string | null) => {
        let href: string | null = null;
        try {
            const parsed = value ? new URL(value) : null;
            if (parsed && ["http:", "https:"].includes(parsed.protocol)) {
                href = parsed.href;
            }
        } catch {
            // Older history may contain text saved before link validation.
        }

        if (!href) return textValue(value);
        return (
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-10 min-w-0 items-start gap-2 bg-faint px-3 py-2 text-accent-deep transition-colors duration-150 ease-out hover:bg-accent-tint-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--external-link] mt-0.5 block size-3.5 shrink-0"
                />
                <span className="min-w-0 break-all">{value}</span>
            </a>
        );
    };
    const beforeValue = (
        <HistoryFieldValue
            change={change}
            value={change.before}
            currency={change.currencyBefore}
            defaultCurrency={defaultCurrency}
            current={false}
        />
    );
    const afterValue = (
        <HistoryFieldValue
            change={change}
            value={change.after}
            currency={change.currencyAfter}
            defaultCurrency={defaultCurrency}
            current
        />
    );

    const count = showCount && change.count > 1 && (
        <span className="text-muted tabular-nums">
            {change.count.toLocaleString()} applications
        </span>
    );

    if (isTextField || isLinkField) {
        const detailedValue = isLinkField ? linkValue : textValue;
        return (
            <HistoryStructuredRow
                subject={subject}
                label={change.label}
                reserveSubjectSpace={
                    reserveSubjectSpace && change.scope === "application"
                }
            >
                {beforeEmpty ? (
                    <div>{detailedValue(change.after)}</div>
                ) : afterEmpty ? (
                    <div>
                        <p className="text-sub">Cleared</p>
                        <p className="mt-2 mb-1 text-muted">Previous value</p>
                        {detailedValue(change.before)}
                    </div>
                ) : (
                    <div className="grid min-w-0 gap-3">
                        <div className="min-w-0">
                            <p className="mb-1 text-muted">Before</p>
                            {detailedValue(change.before)}
                        </div>
                        <div className="min-w-0">
                            <p className="mb-1 text-muted">After</p>
                            {detailedValue(change.after)}
                        </div>
                    </div>
                )}
                {count && <div className="mt-2">{count}</div>}
            </HistoryStructuredRow>
        );
    }

    return (
        <HistoryStructuredRow
            subject={subject}
            label={change.label}
            reserveSubjectSpace={
                reserveSubjectSpace && change.scope === "application"
            }
        >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                {!beforeEmpty && beforeValue}
                {!beforeEmpty && (
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--arrow-right] block size-3.5 shrink-0 text-muted"
                    />
                )}
                {afterEmpty ? <EmptyHistoryValue /> : afterValue}
                {count}
            </div>
        </HistoryStructuredRow>
    );
};

const HistoryChangeDescription = ({
    change,
    showCount = true,
    showSubject = true,
    reserveSubjectSpace = false,
}: {
    change: ListHistoryChange;
    showCount?: boolean;
    showSubject?: boolean;
    reserveSubjectSpace?: boolean;
}) => {
    if (!change.valueChange) return change.description;
    const { before, after, count, field, subject } = change.valueChange;
    const visibleSubject = showSubject ? subject : null;
    const label = field === "status" ? "Status" : "Arrangement";
    const suffix = showCount && count > 1 && (
        <span className="text-muted tabular-nums">
            {count.toLocaleString()} applications
        </span>
    );
    return (
        <HistoryStructuredRow
            subject={visibleSubject}
            label={label}
            reserveSubjectSpace={reserveSubjectSpace}
        >
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sub">
                {before ? (
                    <HistoryValue
                        token={semanticToken(change.valueChange, before)}
                    />
                ) : (
                    <EmptyHistoryValue />
                )}
                <span
                    aria-hidden="true"
                    className="icon-[lucide--arrow-right] block size-3.5 shrink-0 text-muted"
                />
                {after ? (
                    <HistoryValue
                        token={semanticToken(change.valueChange, after)}
                    />
                ) : (
                    <EmptyHistoryValue />
                )}
                {suffix}
            </div>
        </HistoryStructuredRow>
    );
};

const HistoryStatusEntryRow = ({
    change,
    showSubject,
    reserveSubjectSpace = false,
}: {
    change: HistoryStatusEntryChange;
    showSubject: boolean;
    reserveSubjectSpace?: boolean;
}) => {
    const subject = showSubject ? change.subject : null;

    const values = (change.from || change.to || change.note) && (
        <div className="min-w-0">
            {(change.from || change.to) && (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {change.from && (
                        <HistoryValue
                            token={{ field: "status", value: change.from }}
                        />
                    )}
                    {change.from && change.to && (
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--arrow-right] block size-3.5 shrink-0 text-muted"
                        />
                    )}
                    {change.to && (
                        <HistoryValue
                            token={{ field: "status", value: change.to }}
                        />
                    )}
                </div>
            )}
            {change.note && (
                <p className="mt-2 text-pretty whitespace-pre-wrap text-ink">
                    <span className="mr-2 text-muted">Note</span>
                    {change.note}
                </p>
            )}
        </div>
    );

    return (
        <HistoryStructuredRow
            subject={subject}
            reserveSubjectSpace={reserveSubjectSpace}
            label={
                change.action === "added"
                    ? "Added step"
                    : change.action === "removed"
                      ? "Removed step"
                      : "Restored step"
            }
        >
            {values}
        </HistoryStructuredRow>
    );
};

const SUMMARY_ICONS: Record<HistorySummaryChange["icon"], string> = {
    applications: "icon-[lucide--briefcase-business]",
    statusHistory: "icon-[lucide--list-tree]",
    more: "icon-[lucide--ellipsis]",
};

const HistorySummaryRow = ({
    change,
    sectioned = false,
}: {
    change: HistorySummaryChange;
    sectioned?: boolean;
}) => (
    <div className="flex min-w-0 items-center gap-2 text-sub">
        {!sectioned && (
            <span
                aria-hidden="true"
                className={`${SUMMARY_ICONS[change.icon]} block size-3.5 shrink-0 text-muted`}
            />
        )}
        <span>
            {sectioned && change.icon === "statusHistory"
                ? change.label === "Status history updated"
                    ? "Applications updated"
                    : "Status entries restored"
                : change.label}
        </span>
    </div>
);

const HistoryChangeDetail = ({
    change,
    defaultCurrency,
    showCount = true,
    showSubject = true,
    reserveSubjectSpace = false,
    grouped = false,
}: {
    change: ListHistoryChange;
    defaultCurrency: string;
    showCount?: boolean;
    showSubject?: boolean;
    reserveSubjectSpace?: boolean;
    grouped?: boolean;
}) => {
    switch (change.kind) {
        case "field":
            return change.fieldChange ? (
                <HistoryFieldChangeRow
                    change={change.fieldChange}
                    defaultCurrency={defaultCurrency}
                    showCount={showCount}
                    showSubject={showSubject}
                    reserveSubjectSpace={reserveSubjectSpace}
                />
            ) : (
                change.description
            );
        case "value":
            return (
                <HistoryChangeDescription
                    change={change}
                    showCount={showCount}
                    showSubject={showSubject}
                    reserveSubjectSpace={reserveSubjectSpace}
                />
            );
        case "statusEntry":
            return change.statusEntryChange ? (
                <HistoryStatusEntryRow
                    change={change.statusEntryChange}
                    showSubject={showSubject}
                    reserveSubjectSpace={reserveSubjectSpace}
                />
            ) : (
                change.description
            );
        case "summary":
            return change.summaryChange ? (
                <HistorySummaryRow
                    change={change.summaryChange}
                    sectioned={grouped}
                />
            ) : (
                change.description
            );
        case "applications":
            return change.description;
        default: {
            const unhandledKind: never = change.kind;
            return unhandledKind;
        }
    }
};

const ApplicationList = ({
    applications,
    count,
    label,
    keyPrefix,
    listId,
    actionId,
    changeIndex,
    applicationDetails,
    showIcon = true,
    showCount = true,
    nested = false,
}: {
    applications: string[];
    count: number;
    label: string;
    keyPrefix: string;
    listId: string;
    actionId: string;
    changeIndex: number;
    applicationDetails?: HistoryApplicationDetail[];
    showIcon?: boolean;
    showCount?: boolean;
    nested?: boolean;
}) => {
    const [page, setPage] = useState(0);
    const [visibleApplications, setVisibleApplications] =
        useState(applications);
    const [visibleApplicationDetails, setVisibleApplicationDetails] =
        useState(applicationDetails);
    const [isPaging, startPaging] = useTransition();
    const pages = useRef(
        new Map<
            number,
            {
                applications: string[];
                applicationDetails?: HistoryApplicationDetail[];
            }
        >([[0, { applications, applicationDetails }]]),
    );
    const listRef = useRef<HTMLUListElement>(null);
    const minimumListHeight = useRef(0);
    const pageCount = Math.max(
        1,
        Math.ceil(count / HISTORY_APPLICATIONS_PAGE_SIZE),
    );
    const first = page * HISTORY_APPLICATIONS_PAGE_SIZE + 1;
    const last = Math.min(first + visibleApplications.length - 1, count);

    useEffect(() => {
        if (pageCount <= 1) return;
        const list = listRef.current;
        if (!list) return;
        minimumListHeight.current = Math.max(
            minimumListHeight.current,
            list.scrollHeight,
        );
        list.style.minHeight = `${minimumListHeight.current}px`;
    }, [page, pageCount, visibleApplications, visibleApplicationDetails]);

    const showPage = (
        nextPage: number,
        nextApplications: string[],
        nextApplicationDetails?: HistoryApplicationDetail[],
    ) => {
        setPage(nextPage);
        setVisibleApplications(nextApplications);
        setVisibleApplicationDetails(nextApplicationDetails);
    };

    const goToPage = (nextPage: number) => {
        if (nextPage < 0 || nextPage >= pageCount || isPaging) return;
        const cached = pages.current.get(nextPage);
        if (cached) {
            showPage(nextPage, cached.applications, cached.applicationDetails);
            return;
        }
        startPaging(async () => {
            const result = await loadListHistoryApplications(
                listId,
                actionId,
                changeIndex,
                nextPage,
            );
            if (!result) {
                toast.error("Could not load that page.");
                return;
            }
            const next = {
                applications: result.applications,
                applicationDetails: result.applicationDetails,
            };
            pages.current.set(result.page, next);
            showPage(result.page, next.applications, next.applicationDetails);
        });
    };

    return (
        <div>
            <div className="flex min-h-9 items-center gap-2 border-b border-hairline px-1">
                {showIcon && (
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--briefcase-business] block size-3.5 shrink-0 text-muted"
                    />
                )}
                <span
                    className={`font-medium ${nested ? "text-sub" : "text-ink"}`}
                >
                    {label}
                </span>
                {showCount && (
                    <span className="ml-auto shrink-0 text-muted tabular-nums">
                        {count.toLocaleString()}
                    </span>
                )}
            </div>
            <ul
                ref={listRef}
                aria-busy={isPaging}
                className={`grid content-start gap-x-6 transition-opacity duration-150 [&>li:last-child]:border-b-0 ${count > 1 && !visibleApplicationDetails ? "sm:grid-cols-2 sm:[&>li:nth-last-child(-n+2)]:border-b-0" : ""} ${isPaging ? "opacity-50" : ""}`}
            >
                {visibleApplications.map((application, index) => {
                    const detail = visibleApplicationDetails?.[index];
                    return (
                        <li
                            key={`${keyPrefix}-${page}-${index}`}
                            className={`flex min-w-0 items-start gap-2.5 border-b border-faint px-1 ${detail ? "py-3" : "min-h-10 py-2"}`}
                        >
                            <span
                                aria-hidden="true"
                                className="flex size-6 shrink-0 items-center justify-center border border-tile-border bg-background text-xs font-medium text-accent-deep"
                            >
                                {application.trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                                <span
                                    className="block min-w-0 text-pretty break-words text-ink"
                                    title={application}
                                >
                                    {application}
                                </span>
                                {detail && (
                                    <ul className="mt-2 divide-y divide-faint">
                                        {detail.statusEntries.map(
                                            (entry, entryIndex) => (
                                                <li
                                                    key={`${keyPrefix}-${page}-${index}-status-${entryIndex}`}
                                                    className="min-w-0 py-2 first:pt-0 last:pb-0"
                                                >
                                                    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 sm:grid-cols-[6rem_minmax(0,1fr)]">
                                                        <span className="text-muted">
                                                            {entry.action ===
                                                            "added"
                                                                ? "Added step"
                                                                : entry.action ===
                                                                    "removed"
                                                                  ? "Removed step"
                                                                  : "Restored step"}
                                                        </span>
                                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                            {entry.from && (
                                                                <HistoryValue
                                                                    token={{
                                                                        field: "status",
                                                                        value: entry.from,
                                                                    }}
                                                                />
                                                            )}
                                                            {entry.from &&
                                                                entry.to && (
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="icon-[lucide--arrow-right] block size-3.5 shrink-0 text-muted"
                                                                    />
                                                                )}
                                                            {entry.to && (
                                                                <HistoryValue
                                                                    token={{
                                                                        field: "status",
                                                                        value: entry.to,
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                        {entry.note && (
                                                            <>
                                                                <span className="text-muted">
                                                                    Note
                                                                </span>
                                                                <p className="text-pretty break-words text-sub">
                                                                    {entry.note}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            {pageCount > 1 && (
                <div className="-mt-px flex min-h-10 items-center border-t border-hairline pl-1">
                    <span
                        aria-live="polite"
                        className="text-muted tabular-nums"
                    >
                        {first.toLocaleString()}–{last.toLocaleString()} of{" "}
                        {count.toLocaleString()}
                    </span>
                    <div className="ml-auto flex items-center">
                        <button
                            type="button"
                            onClick={() => goToPage(page - 1)}
                            disabled={page === 0 || isPaging}
                            aria-label="Previous applications"
                            title="Previous"
                            className="flex size-10 cursor-pointer items-center justify-center text-muted transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-30 disabled:active:scale-100"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--chevron-left] block size-4"
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => goToPage(page + 1)}
                            disabled={page === pageCount - 1 || isPaging}
                            aria-label="Next applications"
                            title="Next"
                            className="flex size-10 cursor-pointer items-center justify-center text-muted transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-30 disabled:active:scale-100"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--chevron-right] block size-4"
                            />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

type IndexedHistoryChange = {
    change: ListHistoryChange;
    index: number;
};

type HistoryChangeSection = {
    key: "changes" | "applications" | "statusHistory" | "list";
    label: string;
    icon: string | null;
    entries: IndexedHistoryChange[];
};

const RESTORE_SECTION_META = {
    applications: {
        label: "Applications",
        icon: "icon-[lucide--briefcase-business]",
    },
    statusHistory: {
        label: "Status history",
        icon: "icon-[lucide--list-tree]",
    },
    list: {
        label: "List details",
        icon: "icon-[lucide--list]",
    },
} as const;

const restoreSectionFor = (
    change: ListHistoryChange,
): keyof typeof RESTORE_SECTION_META => {
    if (change.kind === "field" && change.fieldChange?.scope === "list") {
        return "list";
    }
    if (
        change.kind === "statusEntry" ||
        (change.kind === "summary" &&
            change.summaryChange?.icon === "statusHistory")
    ) {
        return "statusHistory";
    }
    return "applications";
};

const historyChangeSections = (
    changes: ListHistoryChange[],
    groupRestoreChanges: boolean,
): HistoryChangeSection[] => {
    const entries = changes.map((change, index) => ({ change, index }));
    if (!groupRestoreChanges) {
        return [
            {
                key: "changes",
                label: "What changed",
                icon: null,
                entries,
            },
        ];
    }

    const grouped: Record<
        keyof typeof RESTORE_SECTION_META,
        IndexedHistoryChange[]
    > = {
        applications: [],
        statusHistory: [],
        list: [],
    };
    for (const entry of entries) {
        grouped[restoreSectionFor(entry.change)].push(entry);
    }

    return (
        Object.keys(RESTORE_SECTION_META) as Array<
            keyof typeof RESTORE_SECTION_META
        >
    )
        .filter((key) => grouped[key].length > 0)
        .map((key) => ({
            key,
            ...RESTORE_SECTION_META[key],
            entries: grouped[key],
        }));
};

const HistoryChangeRows = ({
    entries,
    item,
    listId,
    defaultCurrency,
    sectioned,
    keepTriggerInPlace,
}: {
    entries: IndexedHistoryChange[];
    item: ListHistoryItem;
    listId: string;
    defaultCurrency: string;
    sectioned: boolean;
    keepTriggerInPlace: (trigger: HTMLElement) => void;
}) => (
    <ul
        className={`${sectioned ? "mt-1 px-2 sm:px-3" : "mt-2 border-y border-faint"} divide-y divide-faint`}
    >
        {entries.map(({ change, index }) => (
            <li
                key={`${item.id}-${index}`}
                className={`text-pretty text-xs leading-5 text-sub ${change.kind === "applications" ? "py-2" : ""}`}
            >
                {change.kind === "applications" ? (
                    <ApplicationList
                        key={`${item.id}-${index}-${change.description}`}
                        applications={change.applications}
                        applicationDetails={change.applicationDetails}
                        count={change.applicationCount}
                        label={
                            change.applicationListLabel ??
                            (change.applicationCount === 1
                                ? "Application"
                                : "Applications")
                        }
                        keyPrefix={`${item.id}-${index}`}
                        listId={listId}
                        actionId={item.id}
                        changeIndex={index}
                        showIcon={!sectioned}
                        nested={sectioned}
                    />
                ) : change.applications.length > 0 ? (
                    <details className="group/change">
                        <summary
                            onClick={(event) =>
                                keepTriggerInPlace(event.currentTarget)
                            }
                            className="grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 transition-[background-color] duration-150 ease-out hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
                        >
                            <div className="min-w-0 flex-1">
                                <HistoryChangeDetail
                                    change={change}
                                    defaultCurrency={defaultCurrency}
                                    showCount={false}
                                    reserveSubjectSpace={sectioned}
                                    grouped={sectioned}
                                />
                            </div>
                            <span className="flex min-h-10 shrink-0 items-center gap-2 text-muted">
                                <span className="sr-only sm:not-sr-only">
                                    {`View ${change.applicationCount.toLocaleString()} ${change.applicationCount === 1 ? "application" : "applications"}`}
                                </span>
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--chevron-right] block size-3.5 shrink-0 transition-transform duration-150 ease-out group-open/change:rotate-90"
                                />
                            </span>
                        </summary>
                        <ApplicationList
                            key={`${item.id}-${index}-${change.description}`}
                            applications={change.applications}
                            applicationDetails={change.applicationDetails}
                            count={change.applicationCount}
                            label="Affected applications"
                            keyPrefix={`${item.id}-${index}`}
                            listId={listId}
                            actionId={item.id}
                            changeIndex={index}
                            showIcon={!sectioned}
                            showCount={false}
                            nested={sectioned}
                        />
                    </details>
                ) : (
                    <div className="flex min-h-12 items-center px-2 py-2">
                        <HistoryChangeDetail
                            change={change}
                            defaultCurrency={defaultCurrency}
                            showSubject={!item.singleApplication}
                            reserveSubjectSpace={sectioned}
                            grouped={sectioned}
                        />
                    </div>
                )}
            </li>
        ))}
    </ul>
);

type GroupedHistoryItem = {
    item: ListHistoryItem;
    dateTime: LocalDateTimeLabels | null;
};

const groupByDay = (
    items: ListHistoryItem[],
    formatLocalTime: LocalDateTimeFormatter | null,
) => {
    const groups = new Map<
        string,
        { key: string; day: string; items: GroupedHistoryItem[] }
    >();
    for (const item of items) {
        const dateTime = formatLocalTime?.(item.occurredAt) ?? null;
        const key = dateTime?.dateKey ?? item.day;
        const group = groups.get(key);
        const groupedItem = { item, dateTime };
        if (group) group.items.push(groupedItem);
        else {
            groups.set(key, {
                key,
                day: dateTime?.day ?? item.day,
                items: [groupedItem],
            });
        }
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
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [expandedChanges, setExpandedChanges] = useState<Set<string>>(
        () => new Set(),
    );
    const [loadingChanges, setLoadingChanges] = useState<string | null>(null);
    const [undoing, setUndoing] = useState<string | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [confirmingRestore, setConfirmingRestore] = useState<string | null>(
        null,
    );
    const [permanentDelete, setPermanentDelete] =
        useState<ListHistoryItem | null>(null);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [permanentlyDeleting, setPermanentlyDeleting] = useState<
        string | null
    >(null);
    const [isLoading, startLoading] = useTransition();
    const loadedOlder = useRef(false);
    const historyScrollRef = useRef<HTMLDivElement>(null);
    const formatLocalTime = useLocalDateTimeFormatter();

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
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const showMoreChanges = (item: ListHistoryItem) => {
        const alreadyExpanded = expandedChanges.has(item.id);
        if (
            !alreadyExpanded &&
            item.changes.length > HISTORY_CHANGES_PREVIEW_SIZE
        ) {
            setExpandedChanges((current) => new Set(current).add(item.id));
            return;
        }
        if (item.changes.length >= item.changeCount) return;

        setLoadingChanges(item.id);
        startLoading(async () => {
            const page = await loadListHistoryChanges(
                listId,
                item.id,
                item.changes.length,
            );
            setLoadingChanges(null);
            if (!page) {
                toast.error("Could not load more changes.");
                return;
            }
            setItems((current) =>
                current.map((currentItem) =>
                    currentItem.id === item.id &&
                    currentItem.changes.length === page.offset
                        ? {
                              ...currentItem,
                              changes: [
                                  ...currentItem.changes,
                                  ...page.changes,
                              ],
                              changeCount: page.total,
                          }
                        : currentItem,
                ),
            );
            setExpandedChanges((current) => new Set(current).add(item.id));
        });
    };

    const showFewerChanges = (item: ListHistoryItem, trigger: HTMLElement) => {
        const firstButton = trigger.parentElement?.querySelector("button");
        keepTriggerInPlace(firstButton ?? trigger);
        setExpandedChanges((current) => {
            const next = new Set(current);
            next.delete(item.id);
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
                item.reversal === "redo" ? "Change redone" : "Change undone",
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

    const permanentlyDelete = (item: ListHistoryItem) => {
        setPermanentlyDeleting(item.id);
        startLoading(async () => {
            const result = await permanentlyRemoveDeletedApplication(
                listId,
                item.id,
            );
            setPermanentlyDeleting(null);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            toast.success("Application permanently deleted");
            router.refresh();
            dismiss();
        });
    };

    const clearHistory = () => {
        startLoading(async () => {
            const result = await clearListHistory(listId);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            setItems([]);
            setCursor(null);
            setHasMore(false);
            setExpanded(new Set());
            setExpandedChanges(new Set());
            toast.success("History cleared");
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

    const groups = groupByDay(items, formatLocalTime);
    const permanentDeleteLabel =
        permanentDelete?.changes.flatMap((change) => change.applications)[0] ??
        null;

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
                    <div className="flex items-center gap-0.5">
                        {items.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setConfirmingClear(true)}
                                disabled={isLoading}
                                aria-label="Clear history"
                                title="Clear history"
                                className="flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-xs font-medium text-muted transition-[background-color,color,scale] duration-150 ease-out hover:bg-rose-tint hover:text-rose active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose disabled:cursor-wait disabled:opacity-50"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--trash-2] block size-4"
                                />
                                Clear history
                            </button>
                        )}
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
                    </div>
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
                                <section key={group.key}>
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
                                        {group.items.map(
                                            ({ item, dateTime }) => {
                                                const isExpanded = expanded.has(
                                                    item.id,
                                                );
                                                const showsAllChanges =
                                                    expandedChanges.has(
                                                        item.id,
                                                    );
                                                const visibleChanges =
                                                    item.changes.length >
                                                        HISTORY_CHANGES_PREVIEW_SIZE &&
                                                    !showsAllChanges
                                                        ? item.changes.slice(
                                                              0,
                                                              HISTORY_CHANGES_PREVIEW_SIZE,
                                                          )
                                                        : item.changes;
                                                const remainingChangeCount =
                                                    item.changeCount -
                                                    item.changes.length;
                                                const nextChangeCount =
                                                    Math.min(
                                                        showsAllChanges
                                                            ? remainingChangeCount
                                                            : item.changeCount -
                                                                  HISTORY_CHANGES_PREVIEW_SIZE,
                                                        HISTORY_CHANGES_PAGE_SIZE,
                                                    );
                                                const primaryShowsFewer =
                                                    showsAllChanges &&
                                                    remainingChangeCount === 0;
                                                const changeSections =
                                                    historyChangeSections(
                                                        visibleChanges,
                                                        item.restoreTarget !==
                                                            null,
                                                    );
                                                const detailsId = `history-details-${item.id}`;
                                                const hasDetails =
                                                    item.changeCount > 0 ||
                                                    item.undone ||
                                                    item.canUndo ||
                                                    item.canRestore ||
                                                    item.canPermanentlyDelete ||
                                                    item.restoreTarget !== null;
                                                const isConfirming =
                                                    confirmingRestore ===
                                                    item.id;
                                                const exactDateTime =
                                                    dateTime?.exact ??
                                                    `${item.day} at ${item.time}`;
                                                const compactDateTime = `${item.when}, ${dateTime?.time ?? item.time}`;

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
                                                            disabled={
                                                                !hasDetails
                                                            }
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
                                                                    className={`block text-pretty text-sm leading-5 font-medium ${item.undone ? "text-sub" : "text-ink"}`}
                                                                >
                                                                    <HistoryTitle
                                                                        item={
                                                                            item
                                                                        }
                                                                    />
                                                                </span>
                                                                <span className="mt-0.5 block text-xs text-muted tabular-nums">
                                                                    {item.undone
                                                                        ? "Undone, "
                                                                        : ""}
                                                                    <time
                                                                        dateTime={
                                                                            item.occurredAt
                                                                        }
                                                                        title={
                                                                            exactDateTime
                                                                        }
                                                                        aria-label={
                                                                            exactDateTime
                                                                        }
                                                                    >
                                                                        {isExpanded
                                                                            ? exactDateTime
                                                                            : compactDateTime}
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
                                                                                title={
                                                                                    formatLocalTime?.(
                                                                                        item
                                                                                            .restoreTarget
                                                                                            .occurredAt,
                                                                                    )
                                                                                        ?.exact ??
                                                                                    `${item.restoreTarget.day} at ${item.restoreTarget.time}`
                                                                                }
                                                                            >
                                                                                {formatLocalTime?.(
                                                                                    item
                                                                                        .restoreTarget
                                                                                        .occurredAt,
                                                                                )
                                                                                    ?.exact ??
                                                                                    `${item.restoreTarget.day} at ${item.restoreTarget.time}`}
                                                                            </time>
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {item.changes
                                                                    .length >
                                                                0 ? (
                                                                    <div className="mt-4">
                                                                        <div
                                                                            className={
                                                                                item.restoreTarget
                                                                                    ? "space-y-5"
                                                                                    : ""
                                                                            }
                                                                        >
                                                                            {changeSections.map(
                                                                                (
                                                                                    section,
                                                                                ) => (
                                                                                    <section
                                                                                        key={
                                                                                            section.key
                                                                                        }
                                                                                    >
                                                                                        <div
                                                                                            className={`${section.key === "changes" ? "min-h-8 px-2" : "min-h-9 bg-accent-tint-soft px-3"} flex items-center gap-2.5`}
                                                                                        >
                                                                                            {section.icon && (
                                                                                                <span
                                                                                                    aria-hidden="true"
                                                                                                    className={`${section.icon} block size-4 shrink-0 text-accent-deep`}
                                                                                                />
                                                                                            )}
                                                                                            <h4
                                                                                                className={`${section.key === "changes" ? "text-sub" : "text-ink"} text-xs font-semibold text-balance`}
                                                                                            >
                                                                                                {
                                                                                                    section.label
                                                                                                }
                                                                                            </h4>
                                                                                        </div>
                                                                                        <HistoryChangeRows
                                                                                            entries={
                                                                                                section.entries
                                                                                            }
                                                                                            item={
                                                                                                item
                                                                                            }
                                                                                            listId={
                                                                                                listId
                                                                                            }
                                                                                            defaultCurrency={
                                                                                                defaultCurrency
                                                                                            }
                                                                                            sectioned={
                                                                                                section.key !==
                                                                                                "changes"
                                                                                            }
                                                                                            keepTriggerInPlace={
                                                                                                keepTriggerInPlace
                                                                                            }
                                                                                        />
                                                                                    </section>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                        {item.changeCount >
                                                                            HISTORY_CHANGES_PREVIEW_SIZE && (
                                                                            <div className="mt-1 flex min-h-10 flex-wrap items-center gap-1">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={
                                                                                        loadingChanges ===
                                                                                        item.id
                                                                                    }
                                                                                    onClick={(
                                                                                        event,
                                                                                    ) =>
                                                                                        primaryShowsFewer
                                                                                            ? showFewerChanges(
                                                                                                  item,
                                                                                                  event.currentTarget,
                                                                                              )
                                                                                            : showMoreChanges(
                                                                                                  item,
                                                                                              )
                                                                                    }
                                                                                    className="flex h-10 cursor-pointer items-center gap-2 px-2 text-xs font-medium text-sub transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50 disabled:active:scale-100"
                                                                                >
                                                                                    {loadingChanges ===
                                                                                    item.id
                                                                                        ? "Loading changes..."
                                                                                        : primaryShowsFewer
                                                                                          ? "Show fewer changes"
                                                                                          : `Show ${nextChangeCount.toLocaleString()} more changes`}
                                                                                    <span
                                                                                        aria-hidden="true"
                                                                                        className={`${primaryShowsFewer ? "icon-[lucide--chevron-up]" : "icon-[lucide--chevron-down]"} block size-3.5`}
                                                                                    />
                                                                                </button>
                                                                                {showsAllChanges &&
                                                                                    remainingChangeCount >
                                                                                        0 && (
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={
                                                                                                loadingChanges ===
                                                                                                item.id
                                                                                            }
                                                                                            onClick={(
                                                                                                event,
                                                                                            ) =>
                                                                                                showFewerChanges(
                                                                                                    item,
                                                                                                    event.currentTarget,
                                                                                                )
                                                                                            }
                                                                                            className="flex h-10 cursor-pointer items-center gap-2 px-2 text-xs font-medium text-sub transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50 disabled:active:scale-100"
                                                                                        >
                                                                                            Show
                                                                                            fewer
                                                                                            changes
                                                                                            <span
                                                                                                aria-hidden="true"
                                                                                                className="icon-[lucide--chevron-up] block size-3.5"
                                                                                            />
                                                                                        </button>
                                                                                    )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    !item.restoreTarget && (
                                                                        <p className="mt-3 text-xs leading-5 text-sub">
                                                                            {item.undone
                                                                                ? "This change was undone."
                                                                                : item.category ===
                                                                                    "reverted"
                                                                                  ? "The original change is no longer available."
                                                                                  : "The changed fields were not saved."}
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
                                                                            undone.
                                                                        </p>
                                                                    )}

                                                                {(item.canUndo ||
                                                                    item.canRestore ||
                                                                    item.canPermanentlyDelete) && (
                                                                    <div
                                                                        className={`mt-4 flex min-h-13 flex-wrap items-center justify-end gap-1 pt-3 ${item.changes.length === 0 && !item.restoreTarget ? "border-t border-hairline" : ""}`}
                                                                    >
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
                                                                                {item.canPermanentlyDelete && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setPermanentDelete(
                                                                                                item,
                                                                                            )
                                                                                        }
                                                                                        disabled={
                                                                                            isLoading
                                                                                        }
                                                                                        className="mr-auto inline-flex h-10 cursor-pointer items-center px-3 text-xs font-medium text-rose transition-[background-color,scale] duration-150 ease-out hover:bg-rose-tint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose disabled:cursor-wait disabled:opacity-50"
                                                                                    >
                                                                                        {permanentlyDeleting ===
                                                                                        item.id
                                                                                            ? "Deleting..."
                                                                                            : "Delete permanently"}
                                                                                    </button>
                                                                                )}
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
                                            },
                                        )}
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

                {permanentDelete && (
                    <ConfirmDialog
                        title={
                            permanentDeleteLabel
                                ? `Permanently delete ${permanentDeleteLabel}?`
                                : "Permanently delete this application?"
                        }
                        detail="This removes the application from this list and from every History entry. It cannot be restored or undone."
                        confirmLabel="Delete permanently"
                        tone="danger"
                        onConfirm={() => {
                            permanentlyDelete(permanentDelete);
                            setPermanentDelete(null);
                        }}
                        onCancel={() => setPermanentDelete(null)}
                    />
                )}

                {confirmingClear && (
                    <ConfirmDialog
                        title="Clear all history?"
                        detail="This deletes every History entry for this list. Your list and applications will not change. This cannot be undone."
                        confirmLabel="Clear history"
                        tone="danger"
                        onConfirm={() => {
                            setConfirmingClear(false);
                            clearHistory();
                        }}
                        onCancel={() => setConfirmingClear(false)}
                    />
                )}
            </div>
        </dialog>
    );
};
