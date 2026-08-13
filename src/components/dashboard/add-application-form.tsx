"use client";

import {
    useRef,
    useState,
    useTransition,
    type ClipboardEvent,
    type KeyboardEvent,
} from "react";
import { addApplication, suggestFromUrl } from "@/app/dashboard/actions";
import {
    CellSelect,
    DateField,
    STATUS_OPTIONS,
    ARRANGEMENT_OPTIONS,
    formInputClass,
    ghostButtonClass,
    primaryButtonClass,
    quietButtonClass,
} from "@/components/dashboard/table-controls";
import type {
    ApplicationStatus,
    Arrangement,
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
};

const EMPTY_DRAFT: Draft = {
    company: "",
    role: "",
    status: "not_applied",
    location: "",
    arrangement: null,
    pay: "",
    appliedAt: "",
};

export const AddApplicationForm = ({
    listId,
    onClose,
}: {
    listId: string;
    onClose: () => void;
}) => {
    const [url, setUrl] = useState("");
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [missed, setMissed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetching, setFetching] = useState(false);
    const [, startScrape] = useTransition();
    const [isSaving, startSave] = useTransition();
    const companyRef = useRef<HTMLInputElement>(null);
    // A read that is no longer wanted cannot be called off once it is on its
    // way, so each one carries a number and only the current one may write.
    const fetchId = useRef(0);

    const dropFetch = () => {
        fetchId.current += 1;
        setFetching(false);
    };

    const reset = () => {
        dropFetch();
        setUrl("");
        setDraft(EMPTY_DRAFT);
        setMissed(false);
        setError(null);
        onClose();
    };

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    const scrape = (value: string) => {
        const link = value.trim();
        if (!link) return;
        const id = fetchId.current + 1;
        fetchId.current = id;
        setFetching(true);
        setMissed(false);
        startScrape(async () => {
            const found = await suggestFromUrl(link);
            if (fetchId.current !== id) return;
            setDraft((current) => ({
                ...current,
                company: found.company ?? "",
                role: found.role ?? "",
                location: found.location ?? "",
                arrangement: found.arrangement,
                pay: found.pay ?? "",
            }));
            setMissed(found.source === "none");
            setFetching(false);
            companyRef.current?.focus();
        });
    };

    const skipFetch = () => {
        dropFetch();
        companyRef.current?.focus();
    };

    const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData("text");
        if (pasted.trim()) {
            event.preventDefault();
            setUrl(pasted);
            scrape(pasted);
        }
    };

    const save = () => {
        if (!draft.company.trim()) return;
        startSave(async () => {
            const result = await addApplication(listId, {
                company: draft.company,
                role: draft.role,
                status: draft.status,
                location: draft.location,
                arrangement: draft.arrangement,
                pay: draft.pay,
                appliedAt: draft.appliedAt,
                url: url.trim() || null,
            });
            if (result.ok) {
                reset();
            } else {
                setError(result.error);
            }
        });
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
            event.preventDefault();
            save();
        } else if (event.key === "Escape") {
            reset();
        }
    };

    const onUrlKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            // Enter here reads the link; the row is saved from the fields
            // below, so the press must not reach the form's own handler.
            event.stopPropagation();
            scrape(url);
        } else if (event.key === "Escape") {
            reset();
        }
    };

    // A save error is the more urgent of the two and answers the press the user
    // just made, so it takes the line.
    const note =
        error ??
        (missed
            ? "Couldn't read that link. Fill the fields in manually."
            : null);

    return (
        <div
            className="w-full border-b border-hairline bg-surface px-5 py-3"
            onKeyDown={onKeyDown}
        >
            <div className="relative">
                <span
                    aria-hidden="true"
                    className="icon-[lucide--link] pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted"
                />
                <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onPaste={onPaste}
                    onKeyDown={onUrlKeyDown}
                    placeholder="Paste a job posting link to fill the fields, or type them in below"
                    aria-label="Job posting link"
                    autoFocus
                    maxLength={URL_MAX}
                    className={`${formInputClass} py-1.5 pl-8 ${fetching ? "pr-16" : ""}`}
                />
                {fetching && (
                    <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--loader-circle] size-3.5 animate-spin text-muted"
                        />
                        <button
                            type="button"
                            onClick={skipFetch}
                            className={quietButtonClass}
                        >
                            Skip
                        </button>
                    </div>
                )}
            </div>

            {/* The fields are held while a link is being read, since the answer
                lands on all of them at once and would take anything typed in
                the meantime with it. Skip gives them straight back. */}
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input
                    ref={companyRef}
                    value={draft.company}
                    onChange={(event) => set("company", event.target.value)}
                    placeholder="Company"
                    aria-label="Company"
                    maxLength={COMPANY_MAX}
                    disabled={fetching}
                    className={formInputClass}
                />
                <input
                    value={draft.role}
                    onChange={(event) => set("role", event.target.value)}
                    placeholder="Role"
                    aria-label="Role"
                    maxLength={ROLE_MAX}
                    disabled={fetching}
                    className={formInputClass}
                />
                <CellSelect
                    label="Status"
                    value={draft.status}
                    options={STATUS_OPTIONS}
                    onChange={(status) => set("status", status)}
                    variant="form"
                    searchable
                    disabled={fetching}
                />
                <input
                    value={draft.location}
                    onChange={(event) => set("location", event.target.value)}
                    placeholder="Location"
                    aria-label="Location"
                    maxLength={LOCATION_MAX}
                    disabled={fetching}
                    className={formInputClass}
                />
                <CellSelect
                    label="Arrangement"
                    value={draft.arrangement}
                    options={ARRANGEMENT_OPTIONS}
                    onChange={(arrangement) => set("arrangement", arrangement)}
                    variant="form"
                    disabled={fetching}
                />
                <input
                    value={draft.pay}
                    onChange={(event) => set("pay", event.target.value)}
                    placeholder="Pay, e.g. 120k-140k/yr"
                    aria-label="Pay"
                    maxLength={PAY_MAX}
                    disabled={fetching}
                    className={formInputClass}
                />
                <DateField
                    label="Applied date"
                    value={draft.appliedAt}
                    onChange={(appliedAt) => set("appliedAt", appliedAt)}
                    variant="form"
                    disabled={fetching}
                />
            </div>

            <div className="mt-3 flex items-center justify-end gap-3">
                {/* Both the miss and a failed save speak from the button row,
                    whose height the buttons already set, so saying anything
                    never moves the fields above it. */}
                {note && (
                    <p
                        className={`mr-auto min-w-0 truncate text-xs ${error ? "text-rose" : "text-muted"}`}
                    >
                        {note}
                    </p>
                )}
                <button
                    type="button"
                    onClick={reset}
                    className={ghostButtonClass}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!draft.company.trim() || fetching || isSaving}
                    className={primaryButtonClass}
                >
                    Add
                </button>
            </div>
        </div>
    );
};
