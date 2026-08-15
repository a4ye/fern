"use client";

import {
    useLayoutEffect,
    useRef,
    useState,
    useTransition,
    type ClipboardEvent,
    type KeyboardEvent,
} from "react";
import { addApplication, suggestFromUrl } from "@/app/dashboard/actions";
import {
    BasicsFields,
    Drawer,
    DrawerFooter,
    DrawerHeader,
    EMPTY_FIELDS,
    NotesField,
    PayFields,
    Section,
    type ApplicationFields,
} from "@/components/dashboard/application-form";
import {
    CellSelect,
    STATUS_OPTIONS,
    quietButtonClass,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import {
    browserTimeZone,
    todayDateInput,
    type ApplicationStatus,
} from "@/components/dashboard/data";
import { parsePay, payAmountInput } from "@/lib/pay";
import { URL_MAX } from "@/lib/validation";

const LINK_INPUT_ID = "add-application-link";
const LINK_CHOICE_BUTTON_CLASS =
    "inline-flex h-10 shrink-0 cursor-pointer items-center px-3 text-xs font-medium transition-[background-color,color,scale] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const employerHost = (raw: string): string => {
    try {
        return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
        return "Employer website";
    }
};

export const AddApplicationForm = ({
    listId,
    onClose,
}: {
    listId: string;
    onClose: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const [draft, setDraft] = useState<ApplicationFields>(EMPTY_FIELDS);
    const [status, setStatus] = useState<ApplicationStatus>("not_applied");
    const [missed, setMissed] = useState(false);
    // An aggregator link reads well but records the wrong page, so the
    // employer's own is offered here for the user to accept or leave.
    const [employerUrl, setEmployerUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fetching, setFetching] = useState(false);
    const [, startScrape] = useTransition();
    const [saving, setSaving] = useState(false);
    const companyRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    // A read that is no longer wanted cannot be called off once it is on its
    // way, so each one carries a number and only the current one may write.
    const fetchId = useRef(0);

    // A newly opened create drawer always begins with its link field in view,
    // regardless of the scroll position from the previous visit.
    useLayoutEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, []);

    const dropFetch = () => {
        fetchId.current += 1;
        setFetching(false);
    };

    const dismiss = () => {
        dropFetch();
        close(onClose);
    };

    const set = <K extends keyof ApplicationFields>(
        key: K,
        value: ApplicationFields[K],
    ) => setDraft((current) => ({ ...current, [key]: value }));

    const changeStatus = (next: ApplicationStatus) => {
        setStatus(next);
        if (next === "applied") {
            setDraft((current) =>
                current.appliedAt
                    ? current
                    : { ...current, appliedAt: todayDateInput() },
            );
        }
    };

    const scrape = (link: string) => {
        const url = link.trim();
        if (!url) return;
        const id = fetchId.current + 1;
        fetchId.current = id;
        setFetching(true);
        setMissed(false);
        setEmployerUrl(null);
        startScrape(async () => {
            const found = await suggestFromUrl(url);
            if (fetchId.current !== id) return;
            // A posting quotes its pay as a line of text, which the same parser
            // the quick editor uses splits into the fields below.
            const pay = parsePay(found.pay);
            setDraft((current) => ({
                ...current,
                company: found.company ?? "",
                role: found.role ?? "",
                location: found.location ?? "",
                arrangement: found.arrangement,
                payMin: payAmountInput(pay.payMin),
                payMax: payAmountInput(pay.payMax),
                payCurrency: pay.payCurrency,
                payPeriod: pay.payPeriod,
                payNote: pay.payNote ?? "",
            }));
            setMissed(found.source === "none");
            setEmployerUrl(
                found.employerUrl && found.employerUrl !== url
                    ? found.employerUrl
                    : null,
            );
            setFetching(false);
            companyRef.current?.focus();
        });
    };

    // The fields stay as they are: they were read from the aggregator's copy of
    // the posting, which is the fuller one, and only the link is in question.
    const acceptEmployerUrl = () => {
        if (employerUrl) set("url", employerUrl);
        setEmployerUrl(null);
    };

    const skipFetch = () => {
        dropFetch();
        companyRef.current?.focus();
    };

    const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData("text");
        if (pasted.trim()) {
            event.preventDefault();
            set("url", pasted);
            scrape(pasted);
        }
    };

    const onLinkChange = (value: string) => {
        // Editing the source link invalidates both an in-flight read and any
        // employer link proposed for the previous value.
        dropFetch();
        set("url", value);
        setEmployerUrl(null);
    };

    const onLinkKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            scrape(draft.url);
        }
    };

    const save = async () => {
        if (saving || !draft.company.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const result = await addApplication(
                listId,
                { ...draft, status },
                browserTimeZone(),
            );
            if (result.ok) {
                dismiss();
                return;
            }
            setError(result.error);
        } catch {
            setError("Could not reach the server. Try again.");
        }
        setSaving(false);
    };

    // A save error is the more urgent of the two and answers the press the user
    // just made, so it takes the line.
    const note =
        error ??
        (missed
            ? "Couldn't read that link. Fill the fields in manually."
            : null);

    return (
        <Drawer dialogRef={dialogRef} onDismiss={dismiss}>
            <DrawerHeader
                title="New application"
                subtitle="Start with the posting link."
                onDismiss={dismiss}
            />

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {/* The link leads, on a plate of its own, because a pasted one
                    answers most of the form below and typing first throws that
                    work away. */}
                <section className="border-b border-hairline bg-surface px-5 py-5">
                    <label
                        htmlFor={LINK_INPUT_ID}
                        className="block text-sm font-medium text-ink"
                    >
                        Paste a job posting link
                    </label>
                    <div className="relative mt-3">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--link] pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                        />
                        <input
                            id={LINK_INPUT_ID}
                            value={draft.url}
                            onChange={(event) =>
                                onLinkChange(event.target.value)
                            }
                            onPaste={onPaste}
                            onKeyDown={onLinkKeyDown}
                            placeholder="https://"
                            autoFocus
                            maxLength={URL_MAX}
                            className={`w-full border border-hairline bg-background py-2.5 pl-9 text-sm text-ink transition-colors placeholder:text-muted focus:border-accent focus:outline-none ${fetching ? "pr-20" : "pr-3"}`}
                        />
                        {fetching && (
                            <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
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
                    {employerUrl ? (
                        <div className="mt-3 bg-background px-3 py-3 shadow-sm">
                            <div
                                role="status"
                                className="flex items-start gap-3"
                            >
                                <span
                                    aria-hidden="true"
                                    className="flex size-8 shrink-0 items-center justify-center bg-accent-tint-soft text-accent-deep"
                                >
                                    <span className="icon-[lucide--external-link] size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-balance text-sm font-medium text-ink">
                                        Employer link available
                                    </p>
                                    <p className="mt-0.5 text-pretty text-xs text-sub">
                                        Replace the Simplify URL with the source
                                        listing?
                                    </p>
                                    <p
                                        title={employerUrl}
                                        className="mt-2 flex min-w-0 items-start gap-1.5 text-xs font-medium text-accent-deep"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--globe-2] mt-px size-3.5 shrink-0"
                                        />
                                        <span className="break-words">
                                            {employerHost(employerUrl)}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-1 border-t border-faint pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEmployerUrl(null)}
                                    className={`${LINK_CHOICE_BUTTON_CLASS} text-sub hover:bg-surface hover:text-ink`}
                                >
                                    Keep Simplify
                                </button>
                                <button
                                    type="button"
                                    onClick={acceptEmployerUrl}
                                    className={`${LINK_CHOICE_BUTTON_CLASS} bg-accent text-background hover:bg-accent-deep`}
                                >
                                    Use original link
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="mt-2 text-xs text-sub">
                            The company, role, location, and pay fill themselves
                            in. No link? Fill the fields in below.
                        </p>
                    )}
                </section>

                {/* The fields are held while a link is being read, since the
                    answer lands on all of them at once and would take anything
                    typed in the meantime with it. Skip gives them back. */}
                <BasicsFields
                    draft={draft}
                    set={set}
                    disabled={fetching}
                    companyRef={companyRef}
                    omitLink
                />

                <Section title="Status">
                    <CellSelect
                        label="Status"
                        value={status}
                        options={STATUS_OPTIONS}
                        onChange={changeStatus}
                        variant="form"
                        searchable
                        disabled={fetching}
                    />
                </Section>

                <PayFields draft={draft} set={set} disabled={fetching} />
                <NotesField draft={draft} set={set} disabled={fetching} />
            </div>

            <DrawerFooter
                note={
                    note && (
                        <p
                            className={`mr-auto min-w-0 truncate text-xs ${error ? "text-rose" : "text-muted"}`}
                        >
                            {note}
                        </p>
                    )
                }
                onCancel={dismiss}
                onSubmit={save}
                submitLabel={saving ? "Adding" : "Add"}
                submitDisabled={!draft.company.trim() || fetching || saving}
            />
        </Drawer>
    );
};
