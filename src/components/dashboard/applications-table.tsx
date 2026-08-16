"use client";

import {
    useEffect,
    useMemo,
    useOptimistic,
    useRef,
    useState,
    useTransition,
} from "react";
import {
    loadApplicationExtras,
    removeApplication,
    removeApplications,
    setApplicationsArrangement,
    setApplicationsStatus,
    updateApplicationsBulk,
    type ApplicationDraft,
} from "@/app/dashboard/actions";
import { AddApplicationForm } from "@/components/dashboard/add-application-form";
import { ApplicationPanel } from "@/components/dashboard/application-panel";
import {
    APPLICATION_COLUMNS as COLUMNS,
    ApplicationsHeaderRow,
    ROW_HEIGHT,
    ROW_MIN_WIDTH,
    ROW_REM,
} from "@/components/dashboard/applications-columns";
import { useRowWindow } from "@/components/dashboard/use-row-window";
import { ApplicationsFilterMenu } from "@/components/dashboard/applications-filter";
import {
    applicationsFile,
    type ExportFormat,
} from "@/components/dashboard/applications-export";
import {
    DownloadMenu,
    type DownloadFormat,
} from "@/components/dashboard/download-menu";
import {
    NO_FILTERS,
    applicationsView,
    isFiltered,
    nextSort,
    type Filters,
    type Sort,
} from "@/components/dashboard/applications-view";
import {
    CellSelect,
    DateField,
    STATUS_OPTIONS,
    ARRANGEMENT_OPTIONS,
    cellFieldClass,
    checkboxClass,
    dangerButtonClass,
    type Option,
    ghostButtonClass,
    primaryButtonClass,
    quietButtonClass,
    secondaryButtonClass,
} from "@/components/dashboard/table-controls";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import {
    STATUS_META,
    arrangementLabel,
    browserTimeZone,
    formatDay,
    todayDateInput,
    type ApplicationExtras,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import { fileSlug, saveBlob } from "@/lib/download";
import { COMPANY_MAX, LOCATION_MAX, PAY_MAX, ROLE_MAX } from "@/lib/validation";

type Draft = {
    company: string;
    role: string;
    status: ApplicationStatus;
    location: string;
    arrangement: Arrangement | null;
    pay: string;
    appliedAt: string;
    url: string;
};

const draftOf = (app: ApplicationRow): Draft => ({
    company: app.company,
    role: app.role ?? "",
    status: app.status,
    location: app.location ?? "",
    arrangement: app.arrangement,
    pay: app.payNote ?? app.pay ?? "",
    appliedAt: app.appliedAt ?? "",
    url: app.url ?? "",
});

const asDraftInput = (draft: Draft): ApplicationDraft => ({
    company: draft.company,
    role: draft.role,
    status: draft.status,
    location: draft.location,
    arrangement: draft.arrangement,
    pay: draft.pay,
    appliedAt: draft.appliedAt,
    url: draft.url,
});

const sameDraft = (a: Draft, b: Draft): boolean =>
    (Object.keys(a) as (keyof Draft)[]).every((key) => a[key] === b[key]);

// Every cell that can overflow carries its own value as a tooltip, so a clipped
// company or role is still readable without opening the editor.
const Cell = ({
    value,
    className = "text-sub",
}: {
    value: string | null;
    className?: string;
}) => (
    <span className={`truncate ${className}`} title={value ?? undefined}>
        {value}
    </span>
);

// The quick-editable fields of one row, laid out on the shared grid so bulk
// edit mode stays aligned with the read-only rows. Everything an application
// holds beyond these is edited in the detail panel.
const RowFields = ({
    draft,
    onChange,
}: {
    draft: Draft;
    onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) => (
    <>
        <input
            value={draft.company}
            onChange={(event) => onChange("company", event.target.value)}
            placeholder="Company"
            aria-label="Company"
            maxLength={COMPANY_MAX}
            className={cellFieldClass}
        />
        <input
            value={draft.role}
            onChange={(event) => onChange("role", event.target.value)}
            placeholder="Role"
            aria-label="Role"
            maxLength={ROLE_MAX}
            className={cellFieldClass}
        />
        {/* Status reads as a plate, whose own padding holds the label 8px in.
                The field carries the same inset so the label stays put when the
                row switches into edit mode. */}
        <CellSelect
            label="Status"
            value={draft.status}
            options={STATUS_OPTIONS}
            onChange={(status) => onChange("status", status)}
            className="pl-2"
            searchable
        />
        <input
            value={draft.location}
            onChange={(event) => onChange("location", event.target.value)}
            placeholder="Location"
            aria-label="Location"
            maxLength={LOCATION_MAX}
            className={cellFieldClass}
        />
        <CellSelect
            label="Arrangement"
            value={draft.arrangement}
            options={ARRANGEMENT_OPTIONS}
            onChange={(arrangement) => onChange("arrangement", arrangement)}
        />
        <input
            value={draft.pay}
            onChange={(event) => onChange("pay", event.target.value)}
            placeholder="120k-140k/yr"
            aria-label="Pay"
            maxLength={PAY_MAX}
            className={cellFieldClass}
        />
        <DateField
            label="Applied date"
            value={draft.appliedAt}
            onChange={(appliedAt) => onChange("appliedAt", appliedAt)}
        />
    </>
);

const ReadRow = ({
    app,
    selected,
    opening,
    onSelect,
    onEdit,
    onPrefetch,
    onDelete,
}: {
    app: ApplicationRow;
    selected: boolean;
    opening: boolean;
    onSelect: (selected: boolean) => void;
    onEdit: () => void;
    onPrefetch: () => void;
    onDelete: () => void;
}) => {
    const meta = STATUS_META[app.status];
    return (
        <li
            className={`${COLUMNS} ${ROW_HEIGHT} group border-b border-faint px-5 text-xs transition-colors last:border-b-0 ${selected ? "bg-accent-tint-soft" : "hover:bg-surface"}`}
        >
            <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelect(event.target.checked)}
                // Firefox restores tick marks across a reload, which would
                // outlive the selection state that drives the rest of the UI.
                autoComplete="off"
                aria-label={`Select ${app.company}`}
                className={checkboxClass}
            />
            <Cell value={app.company} className="font-medium text-ink" />
            <Cell value={app.role} />
            <span className="min-w-0">
                <span
                    className={`inline-flex max-w-full items-center truncate px-2 py-0.5 font-medium ${meta.plate}`}
                    title={meta.label}
                >
                    {meta.label}
                </span>
            </span>
            <Cell value={app.location} />
            <Cell
                value={
                    app.arrangement ? arrangementLabel(app.arrangement) : null
                }
            />
            <Cell value={app.pay} className="text-sub tabular-nums" />
            <Cell
                value={app.appliedAt ? formatDay(app.appliedAt) : null}
                className="text-sub tabular-nums"
            />
            <Cell value={app.updated} className="text-muted" />
            <span className="flex items-center justify-end gap-0.5 text-muted">
                {app.url && (
                    <a
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open posting"
                        aria-label="Open posting"
                        className="p-1 transition-colors hover:text-ink"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--link] block size-3.5"
                        />
                    </a>
                )}
                {/* This glyph only appears once the pointer is on the row, so
                    reaching it is already a deliberate move, and the trip from
                    here to the press is usually long enough to cover the read
                    behind it. When it is not, the glyph spins and holds the
                    press. It keeps its box either way. */}
                <button
                    type="button"
                    onClick={onEdit}
                    onMouseEnter={onPrefetch}
                    onFocus={onPrefetch}
                    disabled={opening}
                    title="Edit application"
                    aria-label="Edit application"
                    className={`p-1 transition-[color,opacity] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        opening
                            ? "cursor-wait opacity-100"
                            : "cursor-pointer opacity-0 group-hover:opacity-100 hover:text-ink"
                    }`}
                >
                    <span
                        aria-hidden="true"
                        className={`block size-3.5 ${opening ? "icon-[lucide--loader-circle] animate-spin" : "icon-[lucide--pencil]"}`}
                    />
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    title="Delete application"
                    aria-label="Delete application"
                    className="cursor-pointer p-1 opacity-0 transition-[color,opacity] group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--trash-2] block size-3.5"
                    />
                </button>
            </span>
        </li>
    );
};

const BulkRow = ({
    draft,
    updated,
    onChange,
}: {
    draft: Draft;
    updated: string;
    onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) => (
    <li
        className={`${COLUMNS} ${ROW_HEIGHT} border-b border-faint px-5 text-xs last:border-b-0`}
    >
        <span />
        <RowFields draft={draft} onChange={onChange} />
        {/* Nothing here is editable, but the column keeps its reading so the
                row does not trail off into empty space. */}
        <Cell value={updated} className="text-muted" />
    </li>
);

const DeleteRow = ({
    label,
    onConfirm,
    onCancel,
}: {
    label: string;
    onConfirm: () => void;
    onCancel: () => void;
}) => (
    <li
        className={`${ROW_HEIGHT} ${ROW_MIN_WIDTH} flex items-center gap-4 border-b border-faint bg-surface px-5 last:border-b-0`}
    >
        <p className="min-w-0 flex-1 truncate text-xs text-ink">
            Delete {label}? This cannot be undone.
        </p>
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
                onClick={onConfirm}
                className={dangerButtonClass}
            >
                Delete
            </button>
        </div>
    </li>
);

// Narrows the table by any word in a row, which is the one control here that
// answers a question about a whole list rather than about one column. Escape
// empties it, so the way back to every row never involves the keyboard's
// backspace.
const SearchField = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) => (
    <div className="relative max-sm:w-full sm:w-52">
        <span
            aria-hidden="true"
            className="icon-[lucide--search] pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted"
        />
        <input
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Escape") onChange("");
            }}
            placeholder="Search rows"
            aria-label="Search applications"
            className="h-8 w-full border border-hairline bg-background pr-2.5 pl-8 text-sm text-ink transition-colors placeholder:text-muted hover:border-tile-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
    </div>
);

// The rule only reads as a separator while the bar is one line; once it wraps,
// the groups are already apart and it lands mid-row as a stray mark.
const Divider = () => (
    <span
        aria-hidden="true"
        className="hidden h-4 w-px shrink-0 bg-hairline lg:block"
    />
);

// Once the actions wrap to a line of their own they are the only thing on it,
// so they share it out rather than huddling against the left edge.
const FILL_NARROW = "max-sm:grow max-sm:justify-center";

const countLabel = (count: number) =>
    `${count} application${count === 1 ? "" : "s"}`;

// "Not set" is itself a value a bulk edit can write, so backing out of a staged
// field needs an option of its own. It lives in the menu rather than beside it
// so that what it resets is never in question.
const UNCHANGED = "unchanged";

const STAGED_STATUS_OPTIONS: Option<ApplicationStatus | typeof UNCHANGED>[] = [
    { value: UNCHANGED, label: "Leave unchanged" },
    ...STATUS_OPTIONS,
];

const STAGED_ARRANGEMENT_OPTIONS: Option<
    Arrangement | null | typeof UNCHANGED
>[] = [{ value: UNCHANGED, label: "Leave unchanged" }, ...ARRANGEMENT_OPTIONS];

const EXPORT_FORMATS: readonly DownloadFormat<ExportFormat>[] = [
    { id: "csv", label: "CSV", icon: "icon-[lucide--file-text]" },
    { id: "xlsx", label: "XLSX", icon: "icon-[lucide--sheet]" },
    { id: "json", label: "JSON", icon: "icon-[lucide--braces]" },
];

export const ApplicationsTable = ({
    listId,
    name,
    applications,
}: {
    listId: string;
    name: string;
    applications: ApplicationRow[];
}) => {
    const [, startMutation] = useTransition();
    // The panel opens on more than the table carries, so the row it is opened
    // over travels with the notes and status trail fetched for it. Both arrive
    // together, which is what lets the panel draw complete rather than fill in.
    const [editing, setEditing] = useState<{
        id: string;
        extras: ApplicationExtras;
    } | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Map<string, Draft> | null>(null);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkSaving, setBulkSaving] = useState(false);
    // A bulk edit rewrites rows that are mostly scrolled out of view, so a menu
    // pick only stages a value here and the Apply button is what writes it.
    const [stagedStatus, setStagedStatus] = useState<ApplicationStatus | null>(
        null,
    );
    // Wrapped because null is itself a staged value, meaning "clear it".
    const [stagedArrangement, setStagedArrangement] = useState<{
        value: Arrangement | null;
    } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [adding, setAdding] = useState(false);
    // Which rows are shown and in what order. Held here rather than in the URL:
    // it is how one person is reading the table right now, not where they are.
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [sort, setSort] = useState<Sort | null>(null);
    const selectAllRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const [optimisticApplications, applyOptimistic] = useOptimistic(
        applications,
        (
            state,
            action:
                | {
                      type: "status";
                      ids: Set<string>;
                      status: ApplicationStatus;
                      appliedAt: string;
                  }
                | {
                      type: "arrangement";
                      ids: Set<string>;
                      arrangement: Arrangement | null;
                  }
                | { type: "delete"; ids: Set<string> },
        ) => {
            if (action.type === "delete") {
                return state.filter((app) => !action.ids.has(app.id));
            }
            if (action.type === "status") {
                return state.map((app) =>
                    action.ids.has(app.id)
                        ? {
                              ...app,
                              status: action.status,
                              appliedAt:
                                  action.status === "applied"
                                      ? (app.appliedAt ?? action.appliedAt)
                                      : app.appliedAt,
                          }
                        : app,
                );
            }
            return state.map((app) =>
                action.ids.has(app.id)
                    ? { ...app, arrangement: action.arrangement }
                    : app,
            );
        },
    );

    const view = useMemo(
        () => applicationsView(optimisticApplications, filters, sort),
        [optimisticApplications, filters, sort],
    );
    const filtered = isFiltered(filters);
    const rowWindow = useRowWindow(
        scrollRef,
        listRef,
        view.rows.length,
        ROW_REM,
    );

    // A tick belongs to a row on screen, and a row can leave the table while it
    // is ticked: the detail panel can write the very field the table is filtered
    // on. So the count, the appliers and the delete all read from the rows that
    // are showing rather than from everything the set still remembers.
    const selection = view.rows
        .filter((app) => selected.has(app.id))
        .map((app) => app.id);

    const bulkMode = drafts !== null;
    const allSelected =
        view.rows.length > 0 && selection.length === view.rows.length;

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate =
                selection.length > 0 && !allSelected;
        }
    }, [selection.length, allSelected]);

    // The row itself is looked up rather than held, so the panel redraws from
    // the list when a saved change comes back from the server.
    const editingRow = editing
        ? optimisticApplications.find((app) => app.id === editing.id)
        : undefined;

    // Reads already made, held only for as long as the rows they were made for.
    // A save, a bulk status change and an accepted inbox suggestion all come
    // back as a fresh array from the server, and any of them can have moved a
    // status trail underneath an entry, so the whole cache goes with it.
    const [cache, setCache] = useState(() => ({
        rows: applications,
        extras: new Map<string, ApplicationExtras>(),
    }));
    if (cache.rows !== applications) {
        setCache({ rows: applications, extras: new Map() });
    }
    const readExtras = cache.extras;
    const reading = useRef(new Set<string>());

    // Speculative, so it says nothing when it fails: the press that follows asks
    // again through openPanel, which does report it.
    const prefetchExtras = (id: string) => {
        if (readExtras.has(id) || reading.current.has(id)) return;
        reading.current.add(id);
        loadApplicationExtras(id)
            .then((extras) => {
                if (extras) readExtras.set(id, extras);
            })
            .catch(() => {})
            .finally(() => reading.current.delete(id));
    };

    // Fetched before the panel opens rather than inside it, so the panel has
    // everything the moment it appears and never has to reserve space for
    // fields it is still waiting on.
    //
    // A read that fails has to keep the panel shut. Empty notes are a value the
    // panel would happily save back over the real ones, so there is no standing
    // in for them: blank and unread are the same thing to a text box, and only
    // one of them is true.
    const openPanel = (id: string) => {
        const ready = readExtras.get(id);
        if (ready) {
            setEditing({ id, extras: ready });
            return;
        }

        setOpeningId(id);
        setBulkError(null);
        startMutation(async () => {
            try {
                const extras = await loadApplicationExtras(id);
                if (extras) {
                    readExtras.set(id, extras);
                    setEditing({ id, extras });
                } else {
                    setBulkError("That application is no longer there.");
                }
            } catch {
                setBulkError("Could not open this application. Try again.");
            }
            setOpeningId(null);
        });
    };

    const clearStaged = () => {
        setStagedStatus(null);
        setStagedArrangement(null);
    };

    // A staged value belongs to the selection it was staged for, so emptying the
    // selection by any route drops it rather than leaving it primed for the next.
    // Rows that have since left the table are dropped on the way in, so an empty
    // selection means the same thing here as it does on screen.
    const setSelection = (next: Set<string>) => {
        const showing = new Set(
            view.rows.filter((app) => next.has(app.id)).map((app) => app.id),
        );
        setSelected(showing);
        if (showing.size === 0) clearStaged();
    };

    const clearSelection = () => setSelection(new Set());

    const toggleSelected = (id: string, isSelected: boolean) => {
        const next = new Set(selected);
        if (isSelected) {
            next.add(id);
        } else {
            next.delete(id);
        }
        setSelection(next);
    };

    const toggleAll = (isSelected: boolean) =>
        setSelection(
            isSelected ? new Set(view.rows.map((app) => app.id)) : new Set(),
        );

    const onDelete = (id: string) => {
        setDeletingId(null);
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids: new Set([id]) });
            await removeApplication(listId, id);
        });
    };

    // What is on screen is what gets edited, so a filtered table opens an editor
    // over the rows it is showing. The search and filter controls stand down for
    // the duration, which is what keeps that set from moving underneath it.
    const startBulkEdit = () => {
        setBulkError(null);
        setDrafts(new Map(view.rows.map((app) => [app.id, draftOf(app)])));
    };

    // What is on screen is what leaves, so a filtered table writes a file of the
    // rows it is showing, in the order it is showing them. The menu says which.
    const exportRows = (format: ExportFormat) =>
        saveBlob(
            applicationsFile(view.rows, format, name),
            `${fileSlug(name)}-applications.${format}`,
        );

    const setDraftField = <K extends keyof Draft>(
        id: string,
        key: K,
        value: Draft[K],
    ) =>
        setDrafts((current) => {
            if (!current) return current;
            const draft = current.get(id);
            if (!draft) return current;
            const next = new Map(current);
            const changed = { ...draft, [key]: value };
            if (key === "status" && value === "applied" && !changed.appliedAt) {
                changed.appliedAt = todayDateInput();
            }
            next.set(id, changed);
            return next;
        });

    const saveBulk = async () => {
        if (!drafts || bulkSaving) return;
        const byId = new Map(
            optimisticApplications.map((app) => [app.id, app]),
        );
        const changed = [...drafts]
            .map(([id, draft]) => ({ app: byId.get(id), draft }))
            .filter(
                (row): row is { app: ApplicationRow; draft: Draft } =>
                    row.app !== undefined &&
                    !sameDraft(row.draft, draftOf(row.app)),
            );

        if (changed.length === 0) {
            setDrafts(null);
            return;
        }

        setBulkSaving(true);
        setBulkError(null);
        const result = await updateApplicationsBulk(
            listId,
            changed.map((row) => ({
                id: row.app.id,
                input: asDraftInput(row.draft),
                // One line of text cannot hold everything the detail panel can
                // put in the pay columns, so an untouched box leaves them be.
                payTyped: row.draft.pay !== draftOf(row.app).pay,
            })),
            browserTimeZone(),
        );
        setBulkSaving(false);
        if (result.ok) {
            setDrafts(null);
        } else {
            setBulkError(result.error);
        }
    };

    const applyStatus = (status: ApplicationStatus) => {
        const ids = new Set(selection);
        const appliedAt = todayDateInput();
        const timeZone = browserTimeZone();
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "status", ids, status, appliedAt });
            await setApplicationsStatus(listId, [...ids], status, timeZone);
        });
    };

    const applyArrangement = (arrangement: Arrangement | null) => {
        const ids = new Set(selection);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "arrangement", ids, arrangement });
            await setApplicationsArrangement(listId, [...ids], arrangement);
        });
    };

    const deleteSelected = () => {
        const ids = new Set(selection);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids });
            await removeApplications(listId, [...ids]);
        });
    };

    // Both appliers read the selection of this render and clear the staged
    // values on their way out, so they can run back to back.
    const applyStaged = () => {
        if (stagedStatus) applyStatus(stagedStatus);
        if (stagedArrangement) applyArrangement(stagedArrangement.value);
    };

    const selecting = selection.length > 0 && !bulkMode;

    return (
        <section className="border border-hairline bg-background">
            {/* The bulk controls take over the header row rather than adding
                one, so selecting a row tints this bar instead of pushing the
                whole table down. The bar wraps rather than scrolls: its controls
                are how you leave the selection, so none of them may end up off
                the side of a phone. */}
            <div
                className={`flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-5 py-2 lg:py-0 ${selecting ? "bg-surface" : ""}`}
            >
                {selecting ? (
                    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
                        <p className="shrink-0 text-xs text-sub">
                            <span className="font-medium text-ink tabular-nums">
                                {selection.length}
                            </span>{" "}
                            selected
                        </p>
                        <Divider />
                        <div className="flex flex-wrap items-center gap-2">
                            <CellSelect
                                label="Set status for selected"
                                placeholder={
                                    stagedStatus ? undefined : "Set status"
                                }
                                value={stagedStatus}
                                options={STAGED_STATUS_OPTIONS}
                                onChange={(status) =>
                                    setStagedStatus(
                                        status === UNCHANGED ? null : status,
                                    )
                                }
                                className="w-32"
                                variant="form"
                                searchable
                            />
                            <CellSelect
                                label="Set arrangement for selected"
                                placeholder={
                                    stagedArrangement
                                        ? undefined
                                        : "Set arrangement"
                                }
                                value={stagedArrangement?.value ?? null}
                                options={STAGED_ARRANGEMENT_OPTIONS}
                                onChange={(arrangement) =>
                                    setStagedArrangement(
                                        arrangement === UNCHANGED
                                            ? null
                                            : { value: arrangement },
                                    )
                                }
                                className="w-36"
                                variant="form"
                            />
                            <button
                                type="button"
                                onClick={applyStaged}
                                disabled={!stagedStatus && !stagedArrangement}
                                className={primaryButtonClass}
                            >
                                Apply to {selection.length}
                            </button>
                        </div>
                        <Divider />
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            className={`${quietButtonClass} hover:text-rose`}
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--trash-2] size-3.5"
                            />
                            Delete
                        </button>
                        <button
                            type="button"
                            onClick={clearSelection}
                            className={`${quietButtonClass} ml-auto`}
                        >
                            Clear
                        </button>
                    </div>
                ) : (
                    <>
                        <h2 className="flex items-baseline gap-2 text-xs font-medium text-muted">
                            {drafts
                                ? `Editing ${countLabel(drafts.size)}`
                                : "Applications"}
                            {!bulkMode && (
                                <span className="text-sub tabular-nums">
                                    {filtered
                                        ? `${view.rows.length} of ${optimisticApplications.length}`
                                        : optimisticApplications.length}
                                </span>
                            )}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
                            {bulkError && (
                                <p className="mr-1 text-xs text-rose">
                                    {bulkError}
                                </p>
                            )}
                            {bulkMode ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDrafts(null);
                                            setBulkError(null);
                                        }}
                                        className={`${ghostButtonClass} ${FILL_NARROW}`}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveBulk}
                                        disabled={bulkSaving}
                                        className={`${primaryButtonClass} ${FILL_NARROW}`}
                                    >
                                        {bulkSaving ? "Saving" : "Save all"}
                                    </button>
                                </>
                            ) : (
                                <>
                                    {optimisticApplications.length > 0 && (
                                        <>
                                            <SearchField
                                                value={filters.query}
                                                onChange={(query) =>
                                                    setFilters({
                                                        ...filters,
                                                        query,
                                                    })
                                                }
                                            />
                                            <ApplicationsFilterMenu
                                                filters={filters}
                                                statusCounts={view.statusCounts}
                                                arrangementCounts={
                                                    view.arrangementCounts
                                                }
                                                onChange={setFilters}
                                            />
                                        </>
                                    )}
                                    {view.rows.length > 0 && (
                                        <>
                                            <DownloadMenu
                                                title="Export these applications"
                                                heading={
                                                    filtered
                                                        ? `${view.rows.length} shown`
                                                        : countLabel(
                                                              view.rows.length,
                                                          )
                                                }
                                                formats={EXPORT_FORMATS}
                                                className="max-sm:grow"
                                                triggerClass={`${secondaryButtonClass} max-sm:w-full max-sm:justify-center`}
                                                onSelect={exportRows}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--download] size-4 shrink-0"
                                                />
                                                Export
                                            </DownloadMenu>
                                            <button
                                                type="button"
                                                onClick={startBulkEdit}
                                                className={`${secondaryButtonClass} ${FILL_NARROW}`}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--pencil-line] size-4 shrink-0"
                                                />
                                                {filtered
                                                    ? "Edit shown"
                                                    : "Edit all"}
                                            </button>
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setAdding(true)}
                                        className={`${primaryButtonClass} ${FILL_NARROW}`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--plus] mr-1.5 size-4 shrink-0"
                                        />
                                        Add application
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            {adding && !bulkMode && (
                <AddApplicationForm
                    listId={listId}
                    onClose={() => setAdding(false)}
                />
            )}

            {optimisticApplications.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-sub">
                    No applications in this list yet.
                </p>
            ) : view.rows.length === 0 ? (
                <div className="px-5 py-16 text-center">
                    <p className="text-sm text-sub">
                        No applications match this search.
                    </p>
                    <button
                        type="button"
                        onClick={() => setFilters(NO_FILTERS)}
                        className={`${quietButtonClass} mt-3`}
                    >
                        Clear search and filters
                    </button>
                </div>
            ) : (
                <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
                    <ApplicationsHeaderRow
                        sort={sort}
                        // An open editor holds a field under the pointer, and
                        // reordering the rows would move it out from under one
                        // keystroke to the next.
                        onSort={
                            bulkMode
                                ? undefined
                                : (key) =>
                                      setSort((current) =>
                                          nextSort(current, key),
                                      )
                        }
                        selectAll={
                            !bulkMode && (
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={() =>
                                        toggleAll(selection.length === 0)
                                    }
                                    autoComplete="off"
                                    aria-label="Select all applications"
                                    className={checkboxClass}
                                />
                            )
                        }
                    />
                    <ul ref={listRef}>
                        {rowWindow.padTop > 0 && (
                            <li
                                aria-hidden="true"
                                style={{
                                    height: `${rowWindow.padTop * ROW_REM}rem`,
                                }}
                            />
                        )}
                        {view.rows
                            .slice(rowWindow.start, rowWindow.end)
                            .map((app) => {
                                const draft = drafts?.get(app.id);
                                if (draft) {
                                    return (
                                        <BulkRow
                                            key={app.id}
                                            draft={draft}
                                            updated={app.updated}
                                            onChange={(key, value) =>
                                                setDraftField(
                                                    app.id,
                                                    key,
                                                    value,
                                                )
                                            }
                                        />
                                    );
                                }
                                if (app.id === deletingId) {
                                    return (
                                        <DeleteRow
                                            key={app.id}
                                            label={app.company}
                                            onConfirm={() => onDelete(app.id)}
                                            onCancel={() => setDeletingId(null)}
                                        />
                                    );
                                }
                                return (
                                    <ReadRow
                                        key={app.id}
                                        app={app}
                                        selected={selected.has(app.id)}
                                        onSelect={(isSelected) =>
                                            toggleSelected(app.id, isSelected)
                                        }
                                        opening={openingId === app.id}
                                        onEdit={() => openPanel(app.id)}
                                        onPrefetch={() =>
                                            prefetchExtras(app.id)
                                        }
                                        onDelete={() => setDeletingId(app.id)}
                                    />
                                );
                            })}
                        {rowWindow.padBottom > 0 && (
                            <li
                                aria-hidden="true"
                                style={{
                                    height: `${rowWindow.padBottom * ROW_REM}rem`,
                                }}
                            />
                        )}
                    </ul>
                </div>
            )}

            {editing && editingRow && (
                <ApplicationPanel
                    listId={listId}
                    app={editingRow}
                    extras={editing.extras}
                    onClose={() => setEditing(null)}
                />
            )}

            {confirmingDelete && (
                <ConfirmDialog
                    title={`Delete ${countLabel(selection.length)}?`}
                    detail="This cannot be undone."
                    confirmLabel="Delete"
                    tone="danger"
                    onConfirm={() => {
                        deleteSelected();
                        setConfirmingDelete(false);
                    }}
                    onCancel={() => setConfirmingDelete(false)}
                />
            )}
        </section>
    );
};
