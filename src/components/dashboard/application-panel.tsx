"use client";

import { useState } from "react";
import { saveApplicationDetail } from "@/app/dashboard/actions";
import {
    BasicsFields,
    Drawer,
    DrawerFooter,
    DrawerHeader,
    NotesField,
    PayFields,
    Section,
    type ApplicationFields,
} from "@/components/dashboard/application-form";
import {
    CellSelect,
    STATUS_OPTIONS,
    secondaryButtonClass,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import {
    STATUS_META,
    formatEdited,
    type ApplicationRow,
    type ApplicationStatus,
    type StatusStep,
} from "@/components/dashboard/data";
import { payAmountInput } from "@/lib/pay";

const draftOf = (app: ApplicationRow): ApplicationFields => ({
    company: app.company,
    role: app.role ?? "",
    location: app.location ?? "",
    arrangement: app.arrangement,
    appliedAt: app.appliedAt ?? "",
    url: app.url ?? "",
    payMin: payAmountInput(app.payMin),
    payMax: payAmountInput(app.payMax),
    payCurrency: app.payCurrency,
    payPeriod: app.payPeriod,
    bonus: payAmountInput(app.bonus),
    payNote: app.payNote ?? "",
    notes: app.notes ?? "",
});

export const ApplicationPanel = ({
    listId,
    app,
    onClose,
}: {
    listId: string;
    app: ApplicationRow;
    onClose: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const [draft, setDraft] = useState<ApplicationFields>(() => draftOf(app));
    const [staged, setStaged] = useState<ApplicationStatus | null>(null);
    const [added, setAdded] = useState<ApplicationStatus[]>([]);
    const [removed, setRemoved] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof ApplicationFields>(
        key: K,
        value: ApplicationFields[K],
    ) => setDraft((current) => ({ ...current, [key]: value }));

    const dismiss = () => close(onClose);

    const save = async () => {
        if (saving || !draft.company.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const result = await saveApplicationDetail(listId, app.id, draft, {
                removed,
                added,
            });
            if (result.ok) {
                dismiss();
                return;
            }
            setError(result.error);
        } catch {
            // A dropped connection rejects the action, and without this the
            // panel would sit on "Saving" with the edits still unsaved.
            setError("Could not reach the server. Try again.");
        }
        setSaving(false);
    };

    const stageStep = () => {
        if (!staged) return;
        setAdded((queued) => [...queued, staged]);
        setStaged(null);
    };

    // Only recorded changes are listed, so every row has a date and can be
    // taken back. The steps with no event behind them are where the row sat
    // before anything was recorded, which is not something anyone did. Steps
    // staged in this panel join them at the end, where saving will put them.
    const rows = [
        ...app.history
            .filter((step): step is StatusStep & { id: string } =>
                step.id === null ? false : !removed.includes(step.id),
            )
            .map((step) => ({
                key: step.id,
                label: STATUS_META[step.status].label,
                when: step.at ? formatEdited(step.at) : "",
                drop: () => setRemoved((dropped) => [...dropped, step.id]),
            })),
        ...added.map((status, index) => ({
            key: `staged-${index}`,
            label: STATUS_META[status].label,
            when: "Not saved",
            drop: () =>
                setAdded((queued) => queued.filter((_, at) => at !== index)),
        })),
    ];

    return (
        <Drawer dialogRef={dialogRef} onDismiss={dismiss}>
            <DrawerHeader
                title={app.company}
                subtitle={app.role ?? ""}
                onDismiss={dismiss}
            >
                <span
                    className={`shrink-0 px-2 py-0.5 text-xs font-medium ${STATUS_META[app.status].plate}`}
                >
                    {STATUS_META[app.status].label}
                </span>
            </DrawerHeader>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <BasicsFields draft={draft} set={set} />

                <Section title="Status">
                    {rows.length > 0 && (
                        <ol className="mb-3 divide-y divide-faint border-y border-faint">
                            {rows.map((row, index) => (
                                <li
                                    key={row.key}
                                    className="group flex h-8 items-center gap-3 text-xs"
                                >
                                    <span
                                        className={`min-w-0 truncate ${index === rows.length - 1 ? "font-medium text-ink" : "text-sub"}`}
                                    >
                                        {row.label}
                                    </span>
                                    <span className="ml-auto shrink-0 text-muted tabular-nums">
                                        {row.when}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={row.drop}
                                        aria-label={`Remove ${row.label} step`}
                                        title="Remove this step"
                                        className="shrink-0 cursor-pointer text-muted opacity-0 transition-[color,opacity] group-hover:opacity-100 hover:text-rose focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--x] block size-3.5"
                                        />
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                    <div className="flex items-center gap-2">
                        <CellSelect
                            label="Status to record"
                            placeholder={staged ? undefined : "Add a step"}
                            value={staged}
                            options={STATUS_OPTIONS}
                            onChange={setStaged}
                            variant="form"
                            className="flex-1"
                            searchable
                        />
                        <button
                            type="button"
                            onClick={stageStep}
                            disabled={!staged}
                            className={secondaryButtonClass}
                        >
                            Add
                        </button>
                    </div>
                </Section>

                <PayFields draft={draft} set={set} />
                <NotesField draft={draft} set={set} />
            </div>

            <DrawerFooter
                note={
                    error && (
                        <p className="mr-auto min-w-0 truncate text-xs text-rose">
                            {error}
                        </p>
                    )
                }
                onCancel={dismiss}
                onSubmit={save}
                submitLabel={saving ? "Saving" : "Save"}
                submitDisabled={!draft.company.trim() || saving}
            />
        </Drawer>
    );
};
