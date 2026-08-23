"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveAccountSettings } from "@/app/dashboard/settings-actions";
import {
    CURRENCY_OPTIONS,
    CellSelect,
    formInputClass,
    primaryButtonClass,
} from "@/components/dashboard/table-controls";
import { DISPLAY_NAME_MAX } from "@/lib/validation";

const Section = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <section className="mt-10">
        <h2 className="text-xs font-medium text-muted">{title}</h2>
        {children}
    </section>
);

const Row = ({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
}) => (
    <div className="grid gap-2 border-t border-faint py-5 first:mt-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8">
        <div>
            <p className="text-sm font-medium text-ink">{label}</p>
            {hint && (
                <p className="mt-1 text-pretty text-xs leading-5 text-sub">
                    {hint}
                </p>
            )}
        </div>
        <div className="min-w-0 sm:max-w-xs">{children}</div>
    </div>
);

const Toggle = ({
    label,
    on,
    onChange,
}: {
    label: string;
    on: boolean;
    onChange: (on: boolean) => void;
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`focus-frame inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border p-1 transition-colors ${on ? "border-accent bg-accent" : "border-tile-border bg-background"}`}
    >
        <span
            aria-hidden="true"
            className={`size-4 transition-transform ${on ? "translate-x-4.5 bg-background" : "translate-x-0 bg-muted"}`}
        />
    </button>
);

export const AccountSettings = ({
    name,
    signedInAs,
    image,
    defaultCurrency,
    cleanLinks,
    employerLinks,
    tidyTitles,
}: {
    name: string;
    signedInAs: string;
    image: string | null;
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    tidyTitles: boolean;
}) => {
    const router = useRouter();
    const [draftName, setDraftName] = useState(name);
    const [draftCurrency, setDraftCurrency] = useState(defaultCurrency);
    const [draftCleanLinks, setDraftCleanLinks] = useState(cleanLinks);
    const [draftEmployerLinks, setDraftEmployerLinks] = useState(employerLinks);
    const [draftTidyTitles, setDraftTidyTitles] = useState(tidyTitles);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmedName = draftName.trim();
    const changed =
        trimmedName !== name ||
        draftCurrency !== defaultCurrency ||
        draftCleanLinks !== cleanLinks ||
        draftEmployerLinks !== employerLinks ||
        draftTidyTitles !== tidyTitles;

    const save = async () => {
        if (saving || !changed) return;
        setSaving(true);
        setError(null);
        try {
            const result = await saveAccountSettings({
                name: draftName,
                defaultCurrency: draftCurrency,
                cleanLinks: draftCleanLinks,
                employerLinks: draftEmployerLinks,
                tidyTitles: draftTidyTitles,
            });
            if (result.ok) {
                toast.success("Settings saved.");
                router.refresh();
            } else {
                setError(result.error);
            }
        } catch {
            setError("Could not save your settings. Try again.");
        }
        setSaving(false);
    };

    return (
        <div className="mt-8">
            <Section title="Profile">
                <Row label="Signed in as">
                    <div className="flex items-center gap-3">
                        {image ? (
                            <Image
                                src={image}
                                alt=""
                                width={40}
                                height={40}
                                className="size-10 shrink-0 object-cover"
                            />
                        ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center border border-tile-border bg-background text-sm font-medium text-accent">
                                {name.trim().charAt(0).toUpperCase() || "U"}
                            </span>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm text-ink">
                                {signedInAs}
                            </p>
                            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-sub">
                                <span
                                    aria-hidden="true"
                                    className="icon-[simple-icons--github] size-3.5"
                                />
                                GitHub
                            </p>
                        </div>
                    </div>
                </Row>
                <Row label="Display name">
                    <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        maxLength={DISPLAY_NAME_MAX}
                        aria-label="Display name"
                        className={formInputClass}
                    />
                </Row>
            </Section>

            <Section title="Preferences">
                <Row
                    label="Default currency"
                    hint="New applications start in this currency."
                >
                    <CellSelect
                        label="Default currency"
                        value={draftCurrency}
                        options={CURRENCY_OPTIONS}
                        onChange={setDraftCurrency}
                        variant="form"
                        searchable
                    />
                </Row>
                <Row
                    label="Remove link tracking"
                    hint="Job links often include tracking codes. Job Tracker removes them."
                >
                    <Toggle
                        label="Remove link tracking"
                        on={draftCleanLinks}
                        onChange={setDraftCleanLinks}
                    />
                </Row>
                <Row
                    label="Auto convert Simplify links"
                    hint="A Simplify link becomes the employer's own link. Turn this off to confirm each one first."
                >
                    <Toggle
                        label="Auto convert Simplify links"
                        on={draftEmployerLinks}
                        onChange={setDraftEmployerLinks}
                    />
                </Row>
                <Row
                    label="Auto shorten role titles"
                    hint="Job titles often include dates and extra wording. Job Tracker shortens them. Turn this off to confirm each one first."
                >
                    <Toggle
                        label="Auto shorten role titles"
                        on={draftTidyTitles}
                        onChange={setDraftTidyTitles}
                    />
                </Row>
            </Section>

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-hairline pt-6">
                {error && (
                    <p className="mr-auto min-w-0 truncate text-xs text-rose">
                        {error}
                    </p>
                )}
                <button
                    type="button"
                    onClick={save}
                    disabled={!changed || saving}
                    className={primaryButtonClass}
                >
                    {saving ? "Saving" : "Save changes"}
                </button>
            </div>
        </div>
    );
};
