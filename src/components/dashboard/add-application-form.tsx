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
import { recordPostingRead } from "@/app/dashboard/metrics-actions";
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
import { ExtensionInstallDialog } from "@/components/dashboard/extension-install-dialog";
import { mergeImportedApplication } from "@/components/dashboard/merge-imported-application";
import { QrLinkScanner } from "@/components/dashboard/qr-link-scanner";
import {
    CellSelect,
    STATUS_OPTIONS,
    quietButtonClass,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import { useJobImportExtension } from "@/components/dashboard/use-job-import-extension";
import {
    browserTimeZone,
    todayDateInput,
    type ApplicationStatus,
} from "@/components/dashboard/data";
import { cleanLink } from "@/lib/clean-link";
import { importDirect, isDirectlyReadable } from "@/lib/job-import/direct";
import {
    postingFieldsFilled,
    type PostingOutcome,
    type PostingReader,
} from "@/lib/metrics";
import {
    hasPostingSuggestion,
    isScrapedPosting,
    type ScrapedPosting,
} from "@/lib/job-import/shared";
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

// Which readers a link was put in front of, and which one filled the form, is
// only knowable here: two of the three never reach the server. Sent rather than
// awaited, since a read has already done its job by the time it is counted, and
// reported only past the guard that drops a superseded read, so an abandoned
// paste counts as nothing at all.
const reportRead = (
    startedAt: number,
    attempted: PostingReader[],
    outcome: PostingOutcome,
    posting?: ScrapedPosting,
) => {
    void recordPostingRead({
        outcome,
        attempted,
        // Sent whenever a posting came back, `none` included. A Workday link
        // whose page would not parse still fills the company in off the
        // address, and calling that no source at all would leave those reads
        // out of the tally rather than showing them for what they are.
        source: posting?.source ?? null,
        waitedMs: Date.now() - startedAt,
        fieldsFilled: posting ? postingFieldsFilled(posting) : 0,
    });
};

export const AddApplicationForm = ({
    listId,
    defaultCurrency,
    cleanLinks,
    employerLinks,
    onClose,
}: {
    listId: string;
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    onClose: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const [draft, setDraft] = useState<ApplicationFields>({
        ...EMPTY_FIELDS,
        payCurrency: defaultCurrency,
    });
    const [status, setStatus] = useState<ApplicationStatus>("not_applied");
    const [missed, setMissed] = useState(false);
    const [rateLimited, setRateLimited] = useState(false);
    const [visibleImportUrl, setVisibleImportUrl] = useState<string | null>(
        null,
    );
    const [installOpen, setInstallOpen] = useState(false);
    // An aggregator link reads well but records the wrong page, so the
    // employer's own is offered here for the user to accept or leave. A user who
    // always accepts it says so in settings, and then it is swapped in instead.
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
    const editedFields = useRef(new Set<keyof ApplicationFields>());
    const extension = useJobImportExtension();

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
    ) => {
        editedFields.current.add(key);
        setDraft((current) => ({ ...current, [key]: value }));
    };

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

    const applyPosting = (found: ScrapedPosting, url: string) => {
        setDraft((current) =>
            mergeImportedApplication(
                current,
                found,
                editedFields.current,
                defaultCurrency,
            ),
        );
        const employer =
            found.employerUrl && found.employerUrl !== url
                ? found.employerUrl
                : null;
        if (employer && employerLinks) {
            set("url", employer);
            setEmployerUrl(null);
        } else {
            setEmployerUrl(employer);
        }
        setMissed(false);
        setRateLimited(false);
        setVisibleImportUrl(null);
        setFetching(false);
        if (document.visibilityState === "visible") companyRef.current?.focus();
    };

    const scrape = (link: string) => {
        const url = link.trim();
        if (!url) return;
        const id = fetchId.current + 1;
        fetchId.current = id;
        setFetching(true);
        setMissed(false);
        setRateLimited(false);
        setVisibleImportUrl(null);
        setEmployerUrl(null);
        const startedAt = Date.now();
        // Grows as each reader is reached, so what is reported is what was
        // actually tried rather than what might have been.
        const attempted: PostingReader[] = [];
        startScrape(async () => {
            // Read here first where the provider allows it. This browser is the
            // cheapest reader there is: no server, no waiting on anyone else's
            // budget, and it works on a phone, where there is no extension to
            // ask. The two below are what it cannot reach.
            if (isDirectlyReadable(url)) {
                attempted.push("browser");
                const posting = await importDirect(url);
                if (fetchId.current !== id) return;
                if (posting && hasPostingSuggestion(posting)) {
                    reportRead(startedAt, attempted, "browser", posting);
                    applyPosting(posting, url);
                    return;
                }
            }

            let localMiss = false;
            if (extension.availability === "available") {
                attempted.push("extension");
                const response = await extension.importFromUrl(url);
                if (fetchId.current !== id) return;
                if (
                    response.status === "found" &&
                    isScrapedPosting(response.posting) &&
                    hasPostingSuggestion(response.posting)
                ) {
                    reportRead(
                        startedAt,
                        attempted,
                        "extension",
                        response.posting,
                    );
                    applyPosting(response.posting, url);
                    return;
                }
                localMiss = true;
            }

            // Supported ATS/API providers retain a shared-cache-first backend
            // fallback. Unknown employer domains are never fetched by the app
            // server.
            attempted.push("server");
            const fallback = await suggestFromUrl(url);
            if (fetchId.current !== id) return;
            if (
                fallback.status === "found" &&
                hasPostingSuggestion(fallback.posting)
            ) {
                reportRead(startedAt, attempted, "server", fallback.posting);
                applyPosting(fallback.posting, url);
                return;
            }

            // A fallback that found a posting with nothing worth suggesting in
            // it left the form as empty as a miss did, so it is counted as one.
            reportRead(
                startedAt,
                attempted,
                fallback.status === "found" ? "missed" : fallback.status,
            );

            setFetching(false);
            if (localMiss && extension.availability === "available") {
                setVisibleImportUrl(url);
                return;
            }
            setRateLimited(fallback.status === "rate-limited");
            setMissed(fallback.status !== "rate-limited");
            companyRef.current?.focus();
        });
    };

    const openAndImport = () => {
        const url = visibleImportUrl ?? draft.url.trim();
        if (!url || extension.availability !== "available") return;
        const id = fetchId.current + 1;
        fetchId.current = id;
        setFetching(true);
        setMissed(false);
        setRateLimited(false);
        const startedAt = Date.now();
        startScrape(async () => {
            const response = await extension.openAndImport(url);
            if (fetchId.current !== id) return;
            if (
                response.status === "found" &&
                isScrapedPosting(response.posting) &&
                hasPostingSuggestion(response.posting)
            ) {
                reportRead(
                    startedAt,
                    ["extension"],
                    "extension",
                    response.posting,
                );
                applyPosting(response.posting, url);
                return;
            }
            reportRead(startedAt, ["extension"], "missed");
            setFetching(false);
            setVisibleImportUrl(null);
            setMissed(true);
            if (document.visibilityState === "visible") {
                companyRef.current?.focus();
            }
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

    // A link arriving from outside the app is the one carrying a campaign, so it
    // is cleaned where it lands rather than on the way to the server: what the
    // user is shown is then what is saved.
    const arriving = (raw: string) => (cleanLinks ? cleanLink(raw) : raw);

    const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
        const pasted = event.clipboardData.getData("text");
        if (pasted.trim()) {
            event.preventDefault();
            const link = arriving(pasted);
            set("url", link);
            scrape(link);
        }
    };

    const onLinkChange = (value: string) => {
        // Editing the source link invalidates both an in-flight read and any
        // employer link proposed for the previous value.
        dropFetch();
        set("url", value);
        setEmployerUrl(null);
        setVisibleImportUrl(null);
        setMissed(false);
        setRateLimited(false);
    };

    const onLinkKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            scrape(draft.url);
        }
    };

    const onQrScan = (url: string) => {
        const link = arriving(url);
        onLinkChange(link);
        scrape(link);
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
            setError("Could not save your application. Try again.");
        }
        setSaving(false);
    };

    // A save error is the more urgent of the two and answers the press the user
    // just made, so it takes the line.
    const note =
        error ??
        (rateLimited
            ? "That job site is busy. Try again shortly or use the extension."
            : missed
              ? "Couldn't read that link. Fill the fields in manually."
              : null);

    return (
        <>
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
                            Paste or scan a job posting link
                        </label>
                        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                            <div className="relative min-w-0">
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
                                    className={`h-10 w-full border border-hairline bg-background pl-9 text-sm text-ink transition-colors placeholder:text-muted focus:border-accent focus:outline-none ${fetching ? "pr-20" : "pr-3"}`}
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
                            <QrLinkScanner
                                disabled={fetching}
                                onScan={onQrScan}
                            />
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
                                            Replace the Simplify URL with the
                                            source listing?
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
                        ) : visibleImportUrl ? (
                            <div
                                role="status"
                                className="mt-3 bg-background px-3 py-3 shadow-sm"
                            >
                                <div className="flex items-start gap-3">
                                    <span
                                        aria-hidden="true"
                                        className="flex size-8 shrink-0 items-center justify-center bg-gold-tint text-gold"
                                    >
                                        <span className="icon-[lucide--panels-top-left] size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-balance text-sm font-medium text-ink">
                                            Open this posting to finish
                                            importing
                                        </p>
                                        <p className="mt-0.5 text-pretty text-xs leading-5 text-sub">
                                            Some job sites need to be opened
                                            once before Job Tracker can fill
                                            their details.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-end border-t border-faint pt-2">
                                    <button
                                        type="button"
                                        onClick={openAndImport}
                                        className={`${LINK_CHOICE_BUTTON_CLASS} gap-1.5 bg-accent text-background hover:bg-accent-deep`}
                                    >
                                        Open posting &amp; import
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--arrow-up-right] size-3.5"
                                        />
                                    </button>
                                </div>
                            </div>
                        ) : extension.availability === "missing" ? (
                            <div className="mt-3 bg-background px-3 py-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <span
                                        aria-hidden="true"
                                        className="flex size-8 shrink-0 items-center justify-center bg-accent-tint-soft text-accent-deep"
                                    >
                                        <span className="icon-[lucide--zap] size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-balance text-sm font-medium text-ink">
                                            Import faster from more job sites
                                        </p>
                                        <p className="mt-0.5 text-pretty text-xs leading-5 text-sub">
                                            Add the browser extension to fill
                                            details from more sites. Already
                                            installed? Refresh this page once.
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-end gap-1 border-t border-faint pt-2">
                                    <button
                                        type="button"
                                        onClick={() => window.location.reload()}
                                        className={`${LINK_CHOICE_BUTTON_CLASS} gap-1.5 text-sub hover:bg-surface hover:text-ink`}
                                    >
                                        Refresh page
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--refresh-cw] size-3.5"
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInstallOpen(true)}
                                        className={`${LINK_CHOICE_BUTTON_CLASS} gap-1.5 text-accent-deep hover:bg-accent-tint-soft`}
                                    >
                                        About the extension
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--arrow-right] size-3.5"
                                        />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-2 flex items-start gap-1.5 text-pretty text-xs text-sub">
                                {extension.availability === "available" && (
                                    <span
                                        aria-hidden="true"
                                        className="icon-[lucide--zap] mt-px size-3.5 shrink-0 text-accent-deep"
                                    />
                                )}
                                <span>
                                    {extension.availability === "available"
                                        ? "Faster imports are ready. Paste a link to fill the details."
                                        : "The company, role, location, and pay fill themselves in. No link? Fill the fields in below."}
                                </span>
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
            {installOpen && (
                <ExtensionInstallDialog onClose={() => setInstallOpen(false)} />
            )}
        </>
    );
};
