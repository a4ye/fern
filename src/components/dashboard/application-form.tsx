"use client";

import type { ReactNode, RefObject } from "react";
import { LocationInput } from "@/components/dashboard/location-input";
import { SuggestInput } from "@/components/dashboard/suggest-input";
import { DRAWER_TITLE_ID } from "@/components/dashboard/overlay-shell";
import {
    ARRANGEMENT_OPTIONS,
    CURRENCY_OPTIONS,
    CellSelect,
    DateField,
    formInputClass,
    ghostButtonClass,
    primaryButtonClass,
    type Option,
} from "@/components/dashboard/table-controls";
import {
    PAY_PERIODS,
    payPeriodLabel,
    type Arrangement,
    type PayPeriod,
} from "@/components/dashboard/data";
import { DEFAULT_CURRENCY } from "@/lib/pay";
import { searchRoleTitles } from "@/lib/roles";
import {
    AMOUNT_INPUT_MAX,
    COMPANY_MAX,
    NOTES_MAX,
    PAY_MAX,
    ROLE_MAX,
    URL_MAX,
} from "@/lib/constraints";

// Every column an application carries, held as text so a half-typed amount
// survives a re-render. The create drawer and the detail panel edit the same
// set, which is why the fields below are shared between them.
export type ApplicationFields = {
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

export const EMPTY_FIELDS: ApplicationFields = {
    company: "",
    role: "",
    location: "",
    arrangement: null,
    appliedAt: "",
    url: "",
    payMin: "",
    payMax: "",
    payCurrency: DEFAULT_CURRENCY,
    payPeriod: null,
    bonus: "",
    payNote: "",
    notes: "",
};

export type SetField = <K extends keyof ApplicationFields>(
    key: K,
    value: ApplicationFields[K],
) => void;

// A drawer lays its fields out in rows beside a label, and an input carries an
// intrinsic width that would push a row wider than the drawer rather than share
// it, which is what the range fields would do.
const fieldClass = `${formInputClass} min-w-0`;

const PERIOD_OPTIONS: Option<PayPeriod | null>[] = [
    { value: null, label: "Not set" },
    ...PAY_PERIODS.map((period) => ({
        value: period,
        label: payPeriodLabel(period),
    })),
];

export const Section = ({
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

// Labels sit in a fixed column so every field in the drawer starts at the same
// place, however long its name is.
const LABEL_CLASS = "w-24 shrink-0 text-xs text-sub";

// Company is the only field the schemas insist on, so the mark appears once
// rather than every other row carrying an "optional" of its own.
const RequiredMark = () => (
    <span aria-hidden="true" title="Required" className="ml-0.5 text-accent">
        *
    </span>
);

const Field = ({
    label,
    required = false,
    children,
}: {
    label: string;
    required?: boolean;
    children: ReactNode;
}) => (
    <label className="flex items-center gap-4">
        <span className={LABEL_CLASS}>
            {label}
            {required && <RequiredMark />}
        </span>
        {children}
    </label>
);

// The same row for controls that are buttons rather than inputs, which a label
// cannot wrap without stealing their clicks.
export const PickerField = ({
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

// `omitLink` is for the create drawer, which asks for the link first in a row
// of its own rather than as one field among these.
export const BasicsFields = ({
    draft,
    set,
    disabled = false,
    omitLink = false,
    companyRef,
    roleNote,
    locationSuggestions,
    onDismissLocationSuggestions,
}: {
    draft: ApplicationFields;
    set: SetField;
    disabled?: boolean;
    omitLink?: boolean;
    companyRef?: RefObject<HTMLInputElement | null>;
    roleNote?: ReactNode;
    locationSuggestions?: readonly string[];
    onDismissLocationSuggestions?: () => void;
}) => (
    <Section title="Basics">
        <Field label="Company" required>
            <input
                ref={companyRef}
                value={draft.company}
                onChange={(event) => set("company", event.target.value)}
                maxLength={COMPANY_MAX}
                required
                disabled={disabled}
                className={fieldClass}
            />
        </Field>
        <Field label="Role">
            <SuggestInput
                label="Role"
                value={draft.role}
                onChange={(role) => set("role", role)}
                suggest={searchRoleTitles}
                maxLength={ROLE_MAX}
                disabled={disabled}
                className={fieldClass}
            />
        </Field>
        {/* Anything said about the role belongs under the field it would
        change, indented to start where that field starts. */}
        {roleNote && <div className="ml-28">{roleNote}</div>}
        {!omitLink && (
            <Field label="Link">
                <input
                    value={draft.url}
                    onChange={(event) => set("url", event.target.value)}
                    placeholder="https://"
                    maxLength={URL_MAX}
                    disabled={disabled}
                    className={fieldClass}
                />
            </Field>
        )}
        <Field label="Location">
            <LocationInput
                value={draft.location}
                onChange={(location) => set("location", location)}
                disabled={disabled}
                className={fieldClass}
                promotedSuggestions={locationSuggestions}
                onDismissPromotedSuggestions={onDismissLocationSuggestions}
            />
        </Field>
        <PickerField label="Arrangement">
            <CellSelect
                label="Arrangement"
                value={draft.arrangement}
                options={ARRANGEMENT_OPTIONS}
                onChange={(arrangement) => set("arrangement", arrangement)}
                variant="form"
                className="flex-1"
                disabled={disabled}
            />
        </PickerField>
        <PickerField label="Applied">
            <DateField
                label="Applied"
                value={draft.appliedAt}
                onChange={(appliedAt) => set("appliedAt", appliedAt)}
                variant="form"
                className="flex-1"
                disabled={disabled}
            />
        </PickerField>
    </Section>
);

export const PayFields = ({
    draft,
    set,
    disabled = false,
}: {
    draft: ApplicationFields;
    set: SetField;
    disabled?: boolean;
}) => (
    <Section title="Pay">
        <PickerField label="Range">
            <div className="flex flex-1 items-center gap-2">
                <input
                    value={draft.payMin}
                    onChange={(event) => set("payMin", event.target.value)}
                    inputMode="decimal"
                    placeholder="Min"
                    aria-label="Minimum pay"
                    maxLength={AMOUNT_INPUT_MAX}
                    disabled={disabled}
                    className={`${fieldClass} tabular-nums`}
                />
                <span className="shrink-0 text-xs text-muted">to</span>
                <input
                    value={draft.payMax}
                    onChange={(event) => set("payMax", event.target.value)}
                    inputMode="decimal"
                    placeholder="Max"
                    aria-label="Maximum pay"
                    maxLength={AMOUNT_INPUT_MAX}
                    disabled={disabled}
                    className={`${fieldClass} tabular-nums`}
                />
            </div>
        </PickerField>
        <PickerField label="Currency">
            <CellSelect
                label="Currency"
                value={draft.payCurrency}
                options={CURRENCY_OPTIONS}
                onChange={(currency) => set("payCurrency", currency)}
                variant="form"
                className="flex-1"
                searchable
                disabled={disabled}
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
                disabled={disabled}
            />
        </PickerField>
        <Field label="Bonus">
            <input
                value={draft.bonus}
                onChange={(event) => set("bonus", event.target.value)}
                inputMode="decimal"
                placeholder="Signing or annual bonus"
                maxLength={AMOUNT_INPUT_MAX}
                disabled={disabled}
                className={`${fieldClass} tabular-nums`}
            />
        </Field>
        <Field label="Note">
            <input
                value={draft.payNote}
                onChange={(event) => set("payNote", event.target.value)}
                placeholder="Equity, stipend, anything else"
                maxLength={PAY_MAX}
                disabled={disabled}
                className={fieldClass}
            />
        </Field>
    </Section>
);

export const NotesField = ({
    draft,
    set,
    disabled = false,
}: {
    draft: ApplicationFields;
    set: SetField;
    disabled?: boolean;
}) => (
    <Section title="Notes">
        <textarea
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={5}
            placeholder="Recruiter names, prep, anything worth keeping"
            aria-label="Notes"
            maxLength={NOTES_MAX}
            disabled={disabled}
            className={`${fieldClass} resize-y`}
        />
    </Section>
);

// The subtitle keeps its line whether or not it says anything, so a drawer
// whose title arrives without one is no shorter.
export const DrawerHeader = ({
    title,
    subtitle,
    onDismiss,
    children,
}: {
    title: string;
    subtitle: string;
    onDismiss: () => void;
    children?: ReactNode;
}) => (
    <header className="flex shrink-0 items-start gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0 flex-1">
            <h2
                id={DRAWER_TITLE_ID}
                className="truncate text-sm font-medium text-ink"
            >
                {title}
            </h2>
            <p className="mt-0.5 h-4 truncate text-xs text-sub">{subtitle}</p>
        </div>
        {children}
        <button
            type="button"
            onClick={onDismiss}
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
);

// `note` speaks from the button row, whose height the buttons already set, so
// saying anything never moves the fields above it.
export const DrawerFooter = ({
    note,
    onCancel,
    cancelLabel = "Cancel",
    submit,
}: {
    note?: ReactNode;
    onCancel: () => void;
    cancelLabel?: string;
    // Left out by a drawer that is only being read, so the footer keeps its
    // height and its way out without offering a save that would refuse.
    submit?: { label: string; disabled: boolean; onSubmit: () => void };
}) => (
    <footer className="flex shrink-0 items-center justify-end gap-1 border-t border-hairline px-5 py-3">
        {note}
        <button type="button" onClick={onCancel} className={ghostButtonClass}>
            {cancelLabel}
        </button>
        {submit && (
            <button
                type="button"
                onClick={submit.onSubmit}
                disabled={submit.disabled}
                className={primaryButtonClass}
            >
                {submit.label}
            </button>
        )}
    </footer>
);
