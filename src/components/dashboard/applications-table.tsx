"use client";

import {
    useEffect,
    useOptimistic,
    useRef,
    useState,
    useTransition,
    type KeyboardEvent as ReactKeyboardEvent,
    type RefObject,
} from "react";
import {
    removeApplication,
    removeApplications,
    setApplicationsArrangement,
    setApplicationsStatus,
    updateApplication,
    updateApplicationsBulk,
    type ApplicationDraft,
} from "@/app/dashboard/actions";
import { AddApplicationForm } from "@/components/dashboard/add-application-form";
import {
    APPLICATION_COLUMNS as COLUMNS,
    ApplicationsHeaderRow,
    ROW_HEIGHT,
} from "@/components/dashboard/applications-columns";
import {
    CellSelect,
    STATUS_OPTIONS,
    ARRANGEMENT_OPTIONS,
    cellFieldClass,
    checkboxClass,
    editFieldClass,
    ghostButtonClass,
    primaryButtonClass,
    quietButtonClass,
    secondaryButtonClass,
} from "@/components/dashboard/table-controls";
import {
    STATUS_META,
    arrangementLabel,
    formatDay,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import {
    COMPANY_MAX,
    LOCATION_MAX,
    PAY_MAX,
    ROLE_MAX,
    URL_MAX,
} from "@/lib/validation";

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

// The eight editable fields, laid out on the shared grid. Used by the single-row
// editor and every row of bulk edit mode, so the two stay aligned with each
// other and with the read-only rows.
const RowFields = ({
    draft,
    onChange,
    firstFieldRef,
    variant,
}: {
    draft: Draft;
    onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
    firstFieldRef?: RefObject<HTMLInputElement | null>;
    variant: "cell" | "edit";
}) => {
    const fieldClass = variant === "edit" ? editFieldClass : cellFieldClass;
    return (
        <>
            <input
                ref={firstFieldRef}
                value={draft.company}
                onChange={(event) => onChange("company", event.target.value)}
                placeholder="Company"
                aria-label="Company"
                maxLength={COMPANY_MAX}
                className={fieldClass}
            />
            <input
                value={draft.role}
                onChange={(event) => onChange("role", event.target.value)}
                placeholder="Role"
                aria-label="Role"
                maxLength={ROLE_MAX}
                className={fieldClass}
            />
            <CellSelect
                label="Status"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(status) => onChange("status", status)}
                variant={variant}
                searchable
            />
            <input
                value={draft.location}
                onChange={(event) => onChange("location", event.target.value)}
                placeholder="Location"
                aria-label="Location"
                maxLength={LOCATION_MAX}
                className={fieldClass}
            />
            <CellSelect
                label="Arrangement"
                value={draft.arrangement}
                options={ARRANGEMENT_OPTIONS}
                onChange={(arrangement) => onChange("arrangement", arrangement)}
                variant={variant}
            />
            <input
                value={draft.pay}
                onChange={(event) => onChange("pay", event.target.value)}
                placeholder="120k-140k/yr"
                aria-label="Pay"
                maxLength={PAY_MAX}
                className={fieldClass}
            />
            {/* The picker glyph repeated down every row is the noisiest thing
                in bulk edit, so there it only shows on the cell being worked
                on. The lone editing row can afford to always show it. */}
            <input
                type="date"
                value={draft.appliedAt}
                onChange={(event) => onChange("appliedAt", event.target.value)}
                aria-label="Applied date"
                className={`${fieldClass} col-span-2 ${
                    variant === "cell"
                        ? "[&::-webkit-calendar-picker-indicator]:opacity-0 focus:[&::-webkit-calendar-picker-indicator]:opacity-100 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                        : ""
                }`}
            />
        </>
    );
};

const ReadRow = ({
    app,
    selected,
    onSelect,
    onEdit,
    onDelete,
}: {
    app: ApplicationRow;
    selected: boolean;
    onSelect: (selected: boolean) => void;
    onEdit: () => void;
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
                <button
                    type="button"
                    onClick={onEdit}
                    title="Edit application"
                    aria-label="Edit application"
                    className="cursor-pointer p-1 opacity-0 transition-[color,opacity] group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--pencil] block size-3.5"
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

const EditRow = ({
    app,
    onSave,
    onCancel,
}: {
    app: ApplicationRow;
    onSave: (draft: Draft) => Promise<string | null>;
    onCancel: () => void;
}) => {
    const [draft, setDraft] = useState<Draft>(() => draftOf(app));
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const companyRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        companyRef.current?.focus();
    }, []);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    const submit = async () => {
        if (saving || !draft.company.trim()) return;
        setSaving(true);
        // The parent closes the row on success; on failure it stays open with
        // the typed values and the reason.
        const failure = await onSave(draft);
        if (failure) {
            setError(failure);
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
        <li
            className="border-y border-hairline bg-surface"
            onKeyDown={onKeyDown}
        >
            <div className={`${COLUMNS} ${ROW_HEIGHT} px-5`}>
                <span />
                <RowFields
                    draft={draft}
                    onChange={set}
                    firstFieldRef={companyRef}
                    variant="edit"
                />
            </div>
            {/* Laid out on the table grid rather than as a free-floating row, so
                the link field lines up under Company and the buttons under the
                trailing columns. */}
            <div className={`${COLUMNS} px-5 pb-3`}>
                <span />
                <div className="relative col-span-6">
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--link] pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted"
                    />
                    <input
                        value={draft.url}
                        onChange={(event) => set("url", event.target.value)}
                        placeholder="Link to the posting"
                        aria-label="Link to the posting"
                        maxLength={URL_MAX}
                        className={`${editFieldClass} pl-7`}
                    />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1">
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
                        disabled={!draft.company.trim() || saving}
                        className={primaryButtonClass}
                    >
                        {saving ? "Saving" : "Save"}
                    </button>
                </div>
            </div>
            {error && (
                <div className={`${COLUMNS} px-5 pb-3`}>
                    <span />
                    <p className="col-span-9 text-xs text-rose">{error}</p>
                </div>
            )}
        </li>
    );
};

const BulkRow = ({
    draft,
    onChange,
}: {
    draft: Draft;
    onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) => (
    <li
        className={`${COLUMNS} ${ROW_HEIGHT} border-b border-faint px-5 text-xs last:border-b-0`}
    >
        <span />
        <RowFields draft={draft} onChange={onChange} variant="cell" />
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
        className={`${ROW_HEIGHT} flex min-w-[70rem] items-center gap-4 border-b border-faint bg-surface px-5 last:border-b-0`}
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
                className="inline-flex h-8 cursor-pointer items-center bg-rose px-3 text-sm font-medium text-background transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                Delete
            </button>
        </div>
    </li>
);

export const ApplicationsTable = ({
    listId,
    applications,
}: {
    listId: string;
    applications: ApplicationRow[];
}) => {
    const [, startMutation] = useTransition();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Map<string, Draft> | null>(null);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
    const [adding, setAdding] = useState(false);
    const selectAllRef = useRef<HTMLInputElement>(null);

    const [optimisticApplications, applyOptimistic] = useOptimistic(
        applications,
        (
            state,
            action:
                | { type: "edit"; id: string; draft: Draft }
                | {
                      type: "status";
                      ids: Set<string>;
                      status: ApplicationStatus;
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
                        ? { ...app, status: action.status }
                        : app,
                );
            }
            if (action.type === "arrangement") {
                return state.map((app) =>
                    action.ids.has(app.id)
                        ? { ...app, arrangement: action.arrangement }
                        : app,
                );
            }
            return state.map((app) =>
                app.id === action.id
                    ? {
                          ...app,
                          company: action.draft.company.trim(),
                          role: action.draft.role.trim() || null,
                          status: action.draft.status,
                          location: action.draft.location.trim() || null,
                          arrangement: action.draft.arrangement,
                          pay: action.draft.pay.trim() || null,
                          payNote: action.draft.pay.trim() || null,
                          appliedAt: action.draft.appliedAt || null,
                          url: action.draft.url.trim() || null,
                      }
                    : app,
            );
        },
    );

    const bulkMode = drafts !== null;
    const allSelected =
        optimisticApplications.length > 0 &&
        selected.size === optimisticApplications.length;

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate =
                selected.size > 0 && !allSelected;
        }
    }, [selected, allSelected]);

    const clearSelection = () => setSelected(new Set());

    const toggleSelected = (id: string, isSelected: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            if (isSelected) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });

    const toggleAll = (isSelected: boolean) =>
        setSelected(
            isSelected
                ? new Set(optimisticApplications.map((app) => app.id))
                : new Set(),
        );

    const onSave = (id: string, draft: Draft): Promise<string | null> =>
        new Promise((resolve) => {
            // The optimistic edit lives inside the transition so it holds until
            // the server responds; on failure the row reverts on its own.
            startMutation(async () => {
                applyOptimistic({ type: "edit", id, draft });
                const result = await updateApplication(
                    listId,
                    id,
                    asDraftInput(draft),
                );
                if (result.ok) setEditingId(null);
                resolve(result.ok ? null : result.error);
            });
        });

    const onDelete = (id: string) => {
        setDeletingId(null);
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids: new Set([id]) });
            await removeApplication(listId, id);
        });
    };

    const startBulkEdit = () => {
        setBulkError(null);
        setDrafts(
            new Map(
                optimisticApplications.map((app) => [app.id, draftOf(app)]),
            ),
        );
    };

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
            next.set(id, { ...draft, [key]: value });
            return next;
        });

    const saveBulk = async () => {
        if (!drafts || bulkSaving) return;
        const changed = optimisticApplications
            .map((app) => ({ app, draft: drafts.get(app.id) }))
            .filter(
                (row): row is { app: ApplicationRow; draft: Draft } =>
                    row.draft !== undefined &&
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
            })),
        );
        setBulkSaving(false);
        if (result.ok) {
            setDrafts(null);
        } else {
            setBulkError(result.error);
        }
    };

    const applyStatus = (status: ApplicationStatus) => {
        const ids = new Set(selected);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "status", ids, status });
            await setApplicationsStatus(listId, [...ids], status);
        });
    };

    const applyArrangement = (arrangement: Arrangement | null) => {
        const ids = new Set(selected);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "arrangement", ids, arrangement });
            await setApplicationsArrangement(listId, [...ids], arrangement);
        });
    };

    const deleteSelected = () => {
        const ids = new Set(selected);
        clearSelection();
        setConfirmingBulkDelete(false);
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids });
            await removeApplications(listId, [...ids]);
        });
    };

    return (
        <section className="border border-hairline bg-background">
            <div className="flex h-12 items-center justify-between gap-4 border-b border-hairline px-5">
                <h2 className="flex items-baseline gap-2 text-xs font-medium text-muted">
                    {bulkMode ? "Editing every row" : "Applications"}
                    {!bulkMode && (
                        <span className="text-sub tabular-nums">
                            {optimisticApplications.length}
                        </span>
                    )}
                </h2>
                <div className="flex items-center gap-2">
                    {bulkError && (
                        <p className="mr-1 text-xs text-rose">{bulkError}</p>
                    )}
                    {bulkMode ? (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setDrafts(null);
                                    setBulkError(null);
                                }}
                                className={ghostButtonClass}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveBulk}
                                disabled={bulkSaving}
                                className={primaryButtonClass}
                            >
                                {bulkSaving ? "Saving" : "Save all"}
                            </button>
                        </>
                    ) : (
                        <>
                            {optimisticApplications.length > 0 && (
                                <button
                                    type="button"
                                    onClick={startBulkEdit}
                                    className={secondaryButtonClass}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="icon-[lucide--pencil-line] size-4 shrink-0"
                                    />
                                    Edit all
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setAdding(true)}
                                className={primaryButtonClass}
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
            </div>

            {adding && !bulkMode && (
                <AddApplicationForm
                    listId={listId}
                    onClose={() => setAdding(false)}
                />
            )}

            {selected.size > 0 && !bulkMode && (
                <div className="flex h-10 flex-wrap items-center gap-5 border-b border-hairline bg-surface px-5">
                    <span className="text-xs text-ink tabular-nums">
                        {selected.size} selected
                    </span>
                    <CellSelect
                        label="Set status for selected"
                        placeholder="Set status"
                        value={null}
                        options={STATUS_OPTIONS}
                        onChange={applyStatus}
                        className="w-32"
                        variant="form"
                        searchable
                    />
                    <CellSelect
                        label="Set arrangement for selected"
                        placeholder="Set arrangement"
                        value={null}
                        options={ARRANGEMENT_OPTIONS}
                        onChange={applyArrangement}
                        className="w-36"
                        variant="form"
                    />
                    {confirmingBulkDelete ? (
                        <span className="flex items-center gap-4 text-xs text-ink">
                            Delete {selected.size}?
                            <button
                                type="button"
                                onClick={() => setConfirmingBulkDelete(false)}
                                className={quietButtonClass}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={deleteSelected}
                                className={`${quietButtonClass} font-medium text-rose hover:text-rose hover:opacity-80`}
                            >
                                Delete
                            </button>
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmingBulkDelete(true)}
                            className={`${quietButtonClass} hover:text-rose`}
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--trash-2] size-3.5"
                            />
                            Delete
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={clearSelection}
                        className={`${quietButtonClass} ml-auto`}
                    >
                        Clear
                    </button>
                </div>
            )}

            {optimisticApplications.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-sub">
                    No applications in this list yet.
                </p>
            ) : (
                <div className="max-h-[70vh] overflow-auto">
                    <ApplicationsHeaderRow
                        selectAll={
                            !bulkMode && (
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={(event) =>
                                        toggleAll(event.target.checked)
                                    }
                                    aria-label="Select all applications"
                                    className={checkboxClass}
                                />
                            )
                        }
                    />
                    <ul>
                        {optimisticApplications.map((app) => {
                            const draft = drafts?.get(app.id);
                            if (draft) {
                                return (
                                    <BulkRow
                                        key={app.id}
                                        draft={draft}
                                        onChange={(key, value) =>
                                            setDraftField(app.id, key, value)
                                        }
                                    />
                                );
                            }
                            if (app.id === editingId) {
                                return (
                                    <EditRow
                                        key={app.id}
                                        app={app}
                                        onSave={(next) => onSave(app.id, next)}
                                        onCancel={() => setEditingId(null)}
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
                                    onEdit={() => setEditingId(app.id)}
                                    onDelete={() => setDeletingId(app.id)}
                                />
                            );
                        })}
                    </ul>
                </div>
            )}
        </section>
    );
};
