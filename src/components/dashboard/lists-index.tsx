"use client";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    useEffect,
    useOptimistic,
    useRef,
    useState,
    useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    createList,
    deleteList,
    togglePin,
    updateList,
} from "@/app/dashboard/actions";
import {
    formatEdited,
    listsQueryString,
    LIST_SORTS,
    type EmailSyncPanel,
    type ListSort,
    type ListStatus,
    type ListSummary,
} from "@/components/dashboard/data";
import { EmailSyncMenu } from "@/components/dashboard/email-sync";
import { ListRowsSkeleton } from "@/components/dashboard/lists-skeleton";
import {
    ghostButtonClass,
    primaryButtonClass,
} from "@/components/dashboard/table-controls";
import {
    firstIssue,
    LIST_DESCRIPTION_MAX,
    LIST_NAME_MAX,
    listCreateSchema,
    listUpdateSchema,
    type ActionResult,
} from "@/lib/validation";

const STATUS_PLATE: Record<ListStatus, { label: string; className: string }> = {
    active: {
        label: "Active",
        className: "bg-accent-tint text-accent-deep",
    },
    closed: {
        label: "Closed",
        className: "bg-hairline text-sub",
    },
    archived: {
        label: "Archived",
        className: "bg-hairline text-sub",
    },
};

const STATUS_KEYS: ListStatus[] = ["active", "closed", "archived"];

// Sits on the description line rather than below it, so a failed save doesn't
// grow the row. Long messages truncate and keep the full text in the tooltip.
const RowError = ({ message }: { message: string | null }) =>
    message ? (
        <span
            title={message}
            className="max-w-40 shrink-0 truncate text-xs text-rose"
        >
            {message}
        </span>
    ) : null;

const StatusPlate = ({ status }: { status: ListStatus }) => {
    const plate = STATUS_PLATE[status];
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${plate.className}`}
        >
            {plate.label}
        </span>
    );
};

const ListRow = ({
    list,
    href,
    onTogglePin,
    onEdit,
    onDelete,
}: {
    list: ListSummary;
    href: string;
    onTogglePin: (list: ListSummary) => void;
    onEdit: (list: ListSummary) => void;
    onDelete: (list: ListSummary) => void;
}) => (
    <li className="group flex items-stretch border-b border-faint last:border-b-0">
        <Link
            href={href}
            className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-surface"
        >
            <div className="min-w-0 flex-1">
                <div className="flex h-6 items-center gap-3">
                    <span className="truncate text-base font-medium text-ink">
                        {list.name}
                    </span>
                    <StatusPlate status={list.status} />
                </div>
                <p className="mt-1 h-5 truncate text-sm text-sub">
                    {list.description}
                </p>
            </div>
            <div className="hidden items-baseline gap-6 text-sm text-sub sm:flex">
                <span className="tabular-nums">
                    {list.totalApplications} applications
                </span>
                <span className="text-muted">
                    Edited {formatEdited(list.updatedAt)}
                </span>
            </div>
        </Link>
        <button
            type="button"
            onClick={() => onEdit(list)}
            aria-label="Edit list"
            title="Edit list"
            className="flex shrink-0 cursor-pointer items-center px-3 transition-colors hover:bg-surface"
        >
            <span
                aria-hidden="true"
                className="icon-[lucide--pencil] size-4 text-muted transition-colors group-hover:text-sub"
            />
        </button>
        <button
            type="button"
            onClick={() => onDelete(list)}
            aria-label="Delete list"
            title="Delete list"
            className="flex shrink-0 cursor-pointer items-center px-3 transition-colors hover:bg-surface"
        >
            <span
                aria-hidden="true"
                className="icon-[lucide--trash-2] size-4 text-muted transition-colors group-hover:text-sub"
            />
        </button>
        <button
            type="button"
            onClick={() => onTogglePin(list)}
            aria-pressed={list.pinned}
            aria-label={list.pinned ? "Unpin list" : "Pin list"}
            title={list.pinned ? "Unpin list" : "Pin list"}
            className="flex shrink-0 cursor-pointer items-center px-4 transition-colors hover:bg-surface"
        >
            <span
                aria-hidden="true"
                className={`icon-[lucide--pin] size-4 transition-opacity ${
                    list.pinned
                        ? "text-accent"
                        : "text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                }`}
            />
        </button>
    </li>
);

const ListComposerRow = ({
    onCreate,
    onCancel,
}: {
    onCreate: (
        name: string,
        description: string | null,
    ) => Promise<ActionResult>;
    onCancel: () => void;
}) => {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const trimmed = name.trim();
    const submit = async () => {
        if (saving) return;
        const parsed = listCreateSchema.safeParse({ name, description });
        if (!parsed.success) {
            setError(firstIssue(parsed.error));
            return;
        }
        setError(null);
        setSaving(true);
        const result = await onCreate(
            parsed.data.name,
            parsed.data.description,
        );
        // On success the parent closes this row; on failure it stays open so the
        // typed values and the reason are preserved.
        if (!result.ok) {
            setError(result.error);
            setSaving(false);
        }
    };
    const onKeyDown = (event: ReactKeyboardEvent) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void submit();
        } else if (event.key === "Escape") {
            onCancel();
        }
    };

    return (
        <li className="flex items-center gap-4 border-b border-faint bg-surface px-5 py-4 last:border-b-0">
            <div className="min-w-0 flex-1">
                <input
                    ref={nameRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Untitled list"
                    aria-label="List name"
                    maxLength={LIST_NAME_MAX}
                    className="block h-6 w-full bg-transparent text-base font-medium text-ink placeholder:text-muted focus:outline-none"
                />
                <div className="mt-1 flex h-5 items-center gap-2">
                    <input
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Add a description (optional)"
                        aria-label="List description"
                        maxLength={LIST_DESCRIPTION_MAX}
                        className="min-w-0 flex-1 bg-transparent text-sm text-sub placeholder:text-muted focus:outline-none"
                    />
                    <RowError message={error} />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={onCancel}
                    className={ghostButtonClass}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!trimmed || saving}
                    className={primaryButtonClass}
                >
                    Create
                </button>
            </div>
        </li>
    );
};

const ListEditorRow = ({
    list,
    onSave,
    onCancel,
}: {
    list: ListSummary;
    onSave: (
        name: string,
        description: string | null,
        status: ListStatus,
    ) => Promise<ActionResult>;
    onCancel: () => void;
}) => {
    const [name, setName] = useState(list.name);
    const [description, setDescription] = useState(list.description ?? "");
    const [status, setStatus] = useState<ListStatus>(list.status);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const trimmed = name.trim();
    const submit = async () => {
        if (saving) return;
        const parsed = listUpdateSchema.safeParse({
            name,
            description,
            status,
        });
        if (!parsed.success) {
            setError(firstIssue(parsed.error));
            return;
        }
        setError(null);
        setSaving(true);
        const result = await onSave(
            parsed.data.name,
            parsed.data.description,
            parsed.data.status,
        );
        if (!result.ok) {
            setError(result.error);
            setSaving(false);
        }
    };
    const onKeyDown = (event: ReactKeyboardEvent) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void submit();
        } else if (event.key === "Escape") {
            onCancel();
        }
    };

    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-faint bg-surface px-5 py-4 last:border-b-0">
            <div className="min-w-0 flex-1">
                <input
                    ref={nameRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="List name"
                    aria-label="List name"
                    maxLength={LIST_NAME_MAX}
                    className="block h-6 w-full bg-transparent text-base font-medium text-ink placeholder:text-muted focus:outline-none"
                />
                <div className="mt-1 flex h-5 items-center gap-2">
                    <input
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Add a description (optional)"
                        aria-label="List description"
                        maxLength={LIST_DESCRIPTION_MAX}
                        className="min-w-0 flex-1 bg-transparent text-sm text-sub placeholder:text-muted focus:outline-none"
                    />
                    <RowError message={error} />
                </div>
            </div>
            {/* The picker takes the slot the read row gives its application
                count and edited date, so editing adds no line. That slot is
                hidden below sm, where the picker wraps onto its own line. */}
            <div className="order-last flex basis-full gap-1.5 sm:order-none sm:basis-auto">
                {STATUS_KEYS.map((s) => {
                    const plate = STATUS_PLATE[s];
                    return (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(s)}
                            aria-pressed={status === s}
                            className={`inline-flex cursor-pointer items-center px-2 py-0.5 text-xs font-medium transition-opacity ${plate.className} ${status !== s ? "opacity-40" : ""}`}
                        >
                            {plate.label}
                        </button>
                    );
                })}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={onCancel}
                    className={ghostButtonClass}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!trimmed || saving}
                    className={primaryButtonClass}
                >
                    Save
                </button>
            </div>
        </li>
    );
};

const ListDeleteConfirmRow = ({
    list,
    onConfirm,
    onCancel,
}: {
    list: ListSummary;
    onConfirm: () => void;
    onCancel: () => void;
}) => (
    <li className="flex items-center gap-4 border-b border-faint bg-surface px-5 py-4 last:border-b-0">
        <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-ink">
                {list.name}
            </p>
            <p className="mt-1 text-sm text-sub">
                Delete this list? All applications will be permanently removed.
            </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
            <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-8 cursor-pointer items-center px-3 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={onConfirm}
                className="inline-flex h-8 cursor-pointer items-center bg-rose px-3 text-sm font-medium text-background transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Delete
            </button>
        </div>
    </li>
);

// A custom dropdown rather than a native <select>: the browser's native option
// popup can't be styled, so it's rebuilt here to match the design.
const SortSelect = ({
    value,
    onChange,
}: {
    value: ListSort;
    onChange: (key: ListSort) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const current =
        LIST_SORTS.find((option) => option.key === value) ?? LIST_SORTS[0];

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="focus-frame flex h-8 w-44 cursor-pointer items-center justify-between gap-2 border border-hairline bg-background pr-2 pl-2.5 text-sm text-ink transition-colors hover:border-tile-border"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--arrow-up-down] size-3.5 shrink-0 text-muted"
                    />
                    <span className="truncate">{current.label}</span>
                </span>
                <span
                    aria-hidden="true"
                    className={`icon-[lucide--chevron-down] size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            <ul
                role="listbox"
                data-open={open || undefined}
                className="popup absolute right-0 z-20 mt-1 min-w-44 flex-col border border-hairline bg-background shadow-sm"
            >
                {LIST_SORTS.map((option) => {
                    const selected = option.key === value;
                    return (
                        <li
                            key={option.key}
                            role="option"
                            aria-selected={selected}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(option.key);
                                    setOpen(false);
                                }}
                                className={`flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-sm transition-colors ${
                                    selected
                                        ? "bg-accent-tint text-accent-deep"
                                        : "text-ink hover:bg-surface"
                                }`}
                            >
                                {option.label}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export const ListsIndex = ({
    lists,
    total,
    page,
    pageCount,
    search,
    sort,
    emailPanel,
}: {
    lists: ListSummary[];
    total: number;
    page: number;
    pageCount: number;
    search: string;
    sort: ListSort;
    emailPanel: EmailSyncPanel;
}) => {
    const router = useRouter();
    const pathname = usePathname();
    // Navigation (search/sort/paging) drives the loading skeleton; mutations
    // (pin, create) have their own transition so an optimistic update never
    // flashes the whole list.
    const [isNavigating, startNavigate] = useTransition();
    const [, startMutation] = useTransition();
    const [isComposing, setIsComposing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [optimisticLists, applyOptimistic] = useOptimistic(
        lists,
        (
            state,
            action:
                | { type: "pin"; id: string; pinned: boolean }
                | { type: "add"; list: ListSummary }
                | {
                      type: "edit";
                      id: string;
                      name: string;
                      description: string | null;
                      status: ListStatus;
                  }
                | { type: "delete"; id: string },
        ) => {
            if (action.type === "add") return [action.list, ...state];
            if (action.type === "delete")
                return state.filter((l) => l.id !== action.id);
            if (action.type === "edit")
                return state.map((l) =>
                    l.id === action.id
                        ? {
                              ...l,
                              name: action.name,
                              description: action.description,
                              status: action.status,
                          }
                        : l,
                );
            return state.map((l) =>
                l.id === action.id ? { ...l, pinned: action.pinned } : l,
            );
        },
    );

    // Local mirror of the committed search so typing feels instant while the
    // URL (the source of truth) updates on a debounce. When the committed value
    // changes out from under us (back/forward navigation), re-sync during
    // render rather than in an effect.
    const [query, setQuery] = useState(search);
    const [committedSearch, setCommittedSearch] = useState(search);
    if (search !== committedSearch) {
        setCommittedSearch(search);
        setQuery(search);
    }

    // Builds a dashboard URL, preserving the committed filters unless overridden.
    const hrefFor = (next: { q?: string; sort?: ListSort; page?: number }) => {
        const qs = listsQueryString({
            search: next.q ?? search,
            sort: next.sort ?? sort,
            page: next.page ?? page,
        });
        return qs ? `${pathname}?${qs}` : pathname;
    };

    // Opening a list hands it the filters that were in effect, so its back link
    // can return to this exact view rather than the unfiltered first page.
    const currentFilters = listsQueryString({ search, sort, page });
    const detailHref = (id: string) =>
        currentFilters
            ? `/dashboard/${id}?from=${encodeURIComponent(currentFilters)}`
            : `/dashboard/${id}`;

    // Push the debounced search term into the URL, resetting to the first page.
    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed === search) return;
        const handle = setTimeout(() => {
            const qs = listsQueryString({ search: trimmed, sort, page: 1 });
            startNavigate(() => {
                router.replace(qs ? `${pathname}?${qs}` : pathname);
            });
        }, 300);
        return () => clearTimeout(handle);
    }, [query, search, sort, pathname, router, startNavigate]);

    const onSortChange = (key: ListSort) => {
        startNavigate(() => {
            router.replace(hrefFor({ sort: key, page: 1 }));
        });
    };

    const goToPage = (target: number) => {
        startNavigate(() => {
            router.replace(hrefFor({ page: target }));
        });
    };

    const onTogglePin = (list: ListSummary) => {
        const pinned = !list.pinned;
        startMutation(async () => {
            applyOptimistic({ type: "pin", id: list.id, pinned });
            await togglePin(list.id, pinned);
        });
    };

    const onEditList = (
        id: string,
        name: string,
        description: string | null,
        status: ListStatus,
    ): Promise<ActionResult> =>
        new Promise((resolve) => {
            // The optimistic edit lives inside the transition so it holds until
            // the server responds; on failure the committed state is unchanged
            // and the row reverts on its own.
            startMutation(async () => {
                applyOptimistic({
                    type: "edit",
                    id,
                    name,
                    description,
                    status,
                });
                const result = await updateList(id, {
                    name,
                    description,
                    status,
                });
                if (result.ok) setEditingId(null);
                resolve(result);
            });
        });

    const onDeleteList = (list: ListSummary) => {
        setDeletingId(null);
        startMutation(async () => {
            applyOptimistic({ type: "delete", id: list.id });
            await deleteList(list.id);
        });
    };

    const onCreateList = (
        name: string,
        description: string | null,
    ): Promise<ActionResult> =>
        new Promise((resolve) => {
            startMutation(async () => {
                applyOptimistic({
                    type: "add",
                    list: {
                        id: crypto.randomUUID(),
                        name,
                        description,
                        status: "active",
                        pinned: false,
                        updatedAt: new Date().toISOString(),
                        totalApplications: 0,
                    },
                });
                const result = await createList(name, description);
                if (result.ok) setIsComposing(false);
                resolve(result);
            });
        });

    const hasPrev = page > 1;
    const hasNext = page < pageCount;

    return (
        <div className="flex flex-1 flex-col">
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
                    <div className="relative w-full sm:w-56">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--search] pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search lists"
                            aria-label="Search lists"
                            className="focus-frame h-8 w-full border border-hairline bg-background pr-2.5 pl-8 text-sm text-ink transition-colors placeholder:text-muted hover:border-tile-border"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <SortSelect value={sort} onChange={onSortChange} />
                        <EmailSyncMenu panel={emailPanel} />
                        <button
                            type="button"
                            onClick={() => setIsComposing(true)}
                            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 bg-accent px-3 text-sm font-medium whitespace-nowrap text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--plus] size-4 shrink-0"
                            />
                            New list
                        </button>
                    </div>
                </div>
            </div>

            {isNavigating ? (
                <div className="mt-8">
                    <ListRowsSkeleton />
                </div>
            ) : total === 0 && !isComposing ? (
                <div className="mt-8 border border-hairline bg-background px-5 py-16 text-center">
                    <p className="text-sm text-sub">
                        {search
                            ? `No lists match "${search}".`
                            : "No lists yet. Create one to start tracking applications."}
                    </p>
                </div>
            ) : (
                <section className="mt-8">
                    <ul className="border border-hairline bg-background">
                        {isComposing && (
                            <ListComposerRow
                                onCreate={onCreateList}
                                onCancel={() => setIsComposing(false)}
                            />
                        )}
                        {optimisticLists.map((list) =>
                            list.id === editingId ? (
                                <ListEditorRow
                                    key={list.id}
                                    list={list}
                                    onSave={(name, description, status) =>
                                        onEditList(
                                            list.id,
                                            name,
                                            description,
                                            status,
                                        )
                                    }
                                    onCancel={() => setEditingId(null)}
                                />
                            ) : list.id === deletingId ? (
                                <ListDeleteConfirmRow
                                    key={list.id}
                                    list={list}
                                    onConfirm={() => onDeleteList(list)}
                                    onCancel={() => setDeletingId(null)}
                                />
                            ) : (
                                <ListRow
                                    key={list.id}
                                    list={list}
                                    href={detailHref(list.id)}
                                    onTogglePin={onTogglePin}
                                    onEdit={() => setEditingId(list.id)}
                                    onDelete={() => setDeletingId(list.id)}
                                />
                            ),
                        )}
                    </ul>

                    {pageCount > 1 && (
                        <div className="mt-4 flex items-center justify-between">
                            <p className="text-sm text-muted">
                                Page {page} of {pageCount}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => goToPage(page - 1)}
                                    disabled={!hasPrev}
                                    className="focus-frame inline-flex h-8 cursor-pointer items-center border border-hairline bg-background px-3 text-sm text-ink transition-colors hover:border-tile-border disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goToPage(page + 1)}
                                    disabled={!hasNext}
                                    className="focus-frame inline-flex h-8 cursor-pointer items-center border border-hairline bg-background px-3 text-sm text-ink transition-colors hover:border-tile-border disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};
