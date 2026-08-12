"use client";

import {
    useEffect,
    useOptimistic,
    useRef,
    useState,
    useTransition,
} from "react";
import {
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
} from "@/components/dashboard/applications-columns";
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
    formatDay,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
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
        className={`${ROW_HEIGHT} flex min-w-[73rem] items-center gap-4 border-b border-faint bg-surface px-5 last:border-b-0`}
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

const Divider = () => (
    <span aria-hidden="true" className="h-4 w-px shrink-0 bg-hairline" />
);

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
    const selectAllRef = useRef<HTMLInputElement>(null);

    const [optimisticApplications, applyOptimistic] = useOptimistic(
        applications,
        (
            state,
            action:
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
            return state.map((app) =>
                action.ids.has(app.id)
                    ? { ...app, arrangement: action.arrangement }
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

    // Looked up rather than held, so the panel redraws from the list when a
    // saved change or a logged step comes back from the server.
    const editing = optimisticApplications.find((app) => app.id === editingId);

    const clearStaged = () => {
        setStagedStatus(null);
        setStagedArrangement(null);
    };

    // A staged value belongs to the selection it was staged for, so emptying the
    // selection by any route drops it rather than leaving it primed for the next.
    const setSelection = (next: Set<string>) => {
        setSelected(next);
        if (next.size === 0) clearStaged();
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
            isSelected
                ? new Set(optimisticApplications.map((app) => app.id))
                : new Set(),
        );

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
                // One line of text cannot hold everything the detail panel can
                // put in the pay columns, so an untouched box leaves them be.
                payTyped: row.draft.pay !== draftOf(row.app).pay,
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
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids });
            await removeApplications(listId, [...ids]);
        });
    };

    // Both appliers read `selected` from this render and clear the staged
    // values on their way out, so they can run back to back.
    const applyStaged = () => {
        if (stagedStatus) applyStatus(stagedStatus);
        if (stagedArrangement) applyArrangement(stagedArrangement.value);
    };

    const selecting = selected.size > 0 && !bulkMode;

    return (
        <section className="border border-hairline bg-background">
            {/* The bulk controls take over the header row rather than adding
                one, so selecting a row tints this bar instead of pushing the
                whole table down. */}
            <div
                className={`flex h-12 items-center justify-between gap-4 border-b border-hairline px-5 ${selecting ? "bg-surface" : ""}`}
            >
                {selecting ? (
                    <div className="flex w-full items-center gap-4">
                        <p className="shrink-0 text-xs text-sub">
                            <span className="font-medium text-ink tabular-nums">
                                {selected.size}
                            </span>{" "}
                            selected
                        </p>
                        <Divider />
                        <div className="flex items-center gap-2">
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
                                Apply to {selected.size}
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
                            {bulkMode ? "Editing every row" : "Applications"}
                            {!bulkMode && (
                                <span className="text-sub tabular-nums">
                                    {optimisticApplications.length}
                                </span>
                            )}
                        </h2>
                        <div className="flex items-center gap-2">
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
            ) : (
                <div className="max-h-[70vh] overflow-auto">
                    <ApplicationsHeaderRow
                        selectAll={
                            !bulkMode && (
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={() =>
                                        toggleAll(selected.size === 0)
                                    }
                                    autoComplete="off"
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
                                        updated={app.updated}
                                        onChange={(key, value) =>
                                            setDraftField(app.id, key, value)
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
                                    onEdit={() => setEditingId(app.id)}
                                    onDelete={() => setDeletingId(app.id)}
                                />
                            );
                        })}
                    </ul>
                </div>
            )}

            {editing && (
                <ApplicationPanel
                    listId={listId}
                    app={editing}
                    onClose={() => setEditingId(null)}
                />
            )}

            {confirmingDelete && (
                <ConfirmDialog
                    title={`Delete ${countLabel(selected.size)}?`}
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
