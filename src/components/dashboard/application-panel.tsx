"use client";

import { useState, type ReactNode } from "react";
import {
    saveApplicationDetail,
    type ApplicationDetailDraft,
} from "@/app/dashboard/actions";
import {
    ARRANGEMENT_OPTIONS,
    CURRENCY_OPTIONS,
    CellSelect,
    DateField,
    STATUS_OPTIONS,
    formInputClass,
    ghostButtonClass,
    primaryButtonClass,
    secondaryButtonClass,
    type Option,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import {
    PAY_PERIODS,
    STATUS_META,
    formatEdited,
    payPeriodLabel,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
    type PayPeriod,
    type StatusStep,
} from "@/components/dashboard/data";
import { payAmountInput } from "@/lib/pay";
import {
    AMOUNT_INPUT_MAX,
    COMPANY_MAX,
    LOCATION_MAX,
    NOTES_MAX,
    PAY_MAX,
    ROLE_MAX,
    URL_MAX,
} from "@/lib/validation";

type Draft = {
    company: string;
    role: string;
    location: string;
    arrangement: Arrangement | null;
    appliedAt: string;
    url: string;
    payMin: string;
    payMax: string;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    bonus: string;
    payNote: string;
    notes: string;
};

const draftOf = (app: ApplicationRow): Draft => ({
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

const asDetail = (draft: Draft): ApplicationDetailDraft => ({
    company: draft.company,
    role: draft.role,
    location: draft.location,
    arrangement: draft.arrangement,
    appliedAt: draft.appliedAt,
    url: draft.url,
    payMin: draft.payMin,
    payMax: draft.payMax,
    payCurrency: draft.payCurrency,
    payPeriod: draft.payPeriod,
    bonus: draft.bonus,
    payNote: draft.payNote,
    notes: draft.notes,
});

// The panel lays its fields out in rows beside a label, and an input carries an
// intrinsic width that would push a row wider than the panel rather than share
// it, which is what the range fields would do.
const fieldClass = `${formInputClass} min-w-0`;

const PERIOD_OPTIONS: Option<PayPeriod | null>[] = [
    { value: null, label: "Not set" },
    ...PAY_PERIODS.map((period) => ({
        value: period,
        label: payPeriodLabel(period),
    })),
];

const Section = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <section className="border-b border-hairline px-5 py-4">
        <h3 className="mb-3 text-xs font-medium text-muted">{title}</h3>
        <div className="space-y-2">{children}</div>
    </section>
);

// Labels sit in a fixed column so every field in the panel starts at the same
// place, however long its name is.
const LABEL_CLASS = "w-24 shrink-0 text-xs text-sub";

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <label className="flex items-center gap-4">
        <span className={LABEL_CLASS}>{label}</span>
        {children}
    </label>
);

// The same row for controls that are buttons rather than inputs, which a label
// cannot wrap without stealing their clicks.
const PickerField = ({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) => (
    <div className="flex items-center gap-4">
        <span className={LABEL_CLASS}>{label}</span>
        {children}
    </div>
);

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
    const [draft, setDraft] = useState<Draft>(() => draftOf(app));
    const [staged, setStaged] = useState<ApplicationStatus | null>(null);
    const [added, setAdded] = useState<ApplicationStatus[]>([]);
    const [removed, setRemoved] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    const dismiss = () => close(onClose);

    const save = async () => {
        if (saving || !draft.company.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const result = await saveApplicationDetail(
                listId,
                app.id,
                asDetail(draft),
                { removed, added },
            );
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
        <dialog
            ref={dialogRef}
            aria-labelledby="application-panel-title"
            onCancel={(event) => {
                event.preventDefault();
                dismiss();
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) dismiss();
            }}
            className="drawer m-0 ml-auto h-dvh max-h-dvh w-120 max-w-full border-0 bg-background p-0 backdrop:bg-ink/25"
        >
            <div className="flex h-full flex-col border-l border-hairline">
                <header className="flex shrink-0 items-start gap-3 border-b border-hairline px-5 py-4">
                    <div className="min-w-0 flex-1">
                        <h2
                            id="application-panel-title"
                            className="truncate text-sm font-medium text-ink"
                        >
                            {app.company}
                        </h2>
                        <p className="mt-0.5 h-4 truncate text-xs text-sub">
                            {app.role}
                        </p>
                    </div>
                    <span
                        className={`shrink-0 px-2 py-0.5 text-xs font-medium ${STATUS_META[app.status].plate}`}
                    >
                        {STATUS_META[app.status].label}
                    </span>
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Close"
                        title="Close"
                        className="-mr-1 shrink-0 cursor-pointer p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--x] block size-4"
                        />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <Section title="Basics">
                        <Field label="Company">
                            <input
                                value={draft.company}
                                onChange={(event) =>
                                    set("company", event.target.value)
                                }
                                maxLength={COMPANY_MAX}
                                className={fieldClass}
                            />
                        </Field>
                        <Field label="Role">
                            <input
                                value={draft.role}
                                onChange={(event) =>
                                    set("role", event.target.value)
                                }
                                maxLength={ROLE_MAX}
                                className={fieldClass}
                            />
                        </Field>
                        <Field label="Link">
                            <input
                                value={draft.url}
                                onChange={(event) =>
                                    set("url", event.target.value)
                                }
                                placeholder="https://"
                                maxLength={URL_MAX}
                                className={fieldClass}
                            />
                        </Field>
                        <Field label="Location">
                            <input
                                value={draft.location}
                                onChange={(event) =>
                                    set("location", event.target.value)
                                }
                                maxLength={LOCATION_MAX}
                                className={fieldClass}
                            />
                        </Field>
                        <PickerField label="Arrangement">
                            <CellSelect
                                label="Arrangement"
                                value={draft.arrangement}
                                options={ARRANGEMENT_OPTIONS}
                                onChange={(arrangement) =>
                                    set("arrangement", arrangement)
                                }
                                variant="form"
                                className="flex-1"
                            />
                        </PickerField>
                        <PickerField label="Applied">
                            <DateField
                                label="Applied"
                                value={draft.appliedAt}
                                onChange={(appliedAt) =>
                                    set("appliedAt", appliedAt)
                                }
                                variant="form"
                                className="flex-1"
                            />
                        </PickerField>
                    </Section>

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

                    <Section title="Pay">
                        <PickerField label="Range">
                            <div className="flex flex-1 items-center gap-2">
                                <input
                                    value={draft.payMin}
                                    onChange={(event) =>
                                        set("payMin", event.target.value)
                                    }
                                    inputMode="decimal"
                                    placeholder="Min"
                                    aria-label="Minimum pay"
                                    maxLength={AMOUNT_INPUT_MAX}
                                    className={`${fieldClass} tabular-nums`}
                                />
                                <span className="shrink-0 text-xs text-muted">
                                    to
                                </span>
                                <input
                                    value={draft.payMax}
                                    onChange={(event) =>
                                        set("payMax", event.target.value)
                                    }
                                    inputMode="decimal"
                                    placeholder="Max"
                                    aria-label="Maximum pay"
                                    maxLength={AMOUNT_INPUT_MAX}
                                    className={`${fieldClass} tabular-nums`}
                                />
                            </div>
                        </PickerField>
                        <PickerField label="Currency">
                            <CellSelect
                                label="Currency"
                                value={draft.payCurrency}
                                options={CURRENCY_OPTIONS}
                                onChange={(currency) =>
                                    set("payCurrency", currency)
                                }
                                variant="form"
                                className="flex-1"
                                searchable
                            />
                        </PickerField>
                        <PickerField label="Frequency">
                            <CellSelect
                                label="Frequency"
                                value={draft.payPeriod}
                                options={PERIOD_OPTIONS}
                                onChange={(period) => set("payPeriod", period)}
                                variant="form"
                                className="flex-1"
                            />
                        </PickerField>
                        <Field label="Bonus">
                            <input
                                value={draft.bonus}
                                onChange={(event) =>
                                    set("bonus", event.target.value)
                                }
                                inputMode="decimal"
                                placeholder="Signing or annual bonus"
                                maxLength={AMOUNT_INPUT_MAX}
                                className={`${fieldClass} tabular-nums`}
                            />
                        </Field>
                        <Field label="Note">
                            <input
                                value={draft.payNote}
                                onChange={(event) =>
                                    set("payNote", event.target.value)
                                }
                                placeholder="Equity, stipend, anything else"
                                maxLength={PAY_MAX}
                                className={fieldClass}
                            />
                        </Field>
                    </Section>

                    <Section title="Notes">
                        <textarea
                            value={draft.notes}
                            onChange={(event) =>
                                set("notes", event.target.value)
                            }
                            rows={5}
                            placeholder="Recruiter names, prep, anything worth keeping"
                            aria-label="Notes"
                            maxLength={NOTES_MAX}
                            className={`${fieldClass} resize-y`}
                        />
                    </Section>
                </div>

                <footer className="flex shrink-0 items-center justify-end gap-1 border-t border-hairline px-5 py-3">
                    {error && (
                        <p className="mr-auto text-xs text-rose">{error}</p>
                    )}
                    <button
                        type="button"
                        onClick={dismiss}
                        className={ghostButtonClass}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!draft.company.trim() || saving}
                        className={primaryButtonClass}
                    >
                        {saving ? "Saving" : "Save"}
                    </button>
                </footer>
            </div>
        </dialog>
    );
};
