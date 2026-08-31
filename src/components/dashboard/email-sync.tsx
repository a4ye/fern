"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { EMAIL_SYNC_COPY, emailSyncSuccessMessage } from "@/lib/email/copy";
import {
    acceptSuggestion,
    dismissSuggestionAction,
    syncInbox,
} from "@/app/dashboard/email-actions";
import {
    STATUS_META,
    browserTimeZone,
    formatRelative,
    type ApplicationStatus,
    type EmailSuggestion,
    type EmailSyncPanel,
} from "@/components/dashboard/data";
import { LocalDateTime } from "@/components/dashboard/local-date-time";

// Gmail read-only scope, requested when the user links their Google account.
// Kept as a literal here so this client bundle never imports server auth code.
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const gmailMessageUrl = (messageId: string): string =>
    `https://mail.google.com/mail/#all/${encodeURIComponent(messageId)}`;

const StatusPill = ({ status }: { status: ApplicationStatus }) => {
    const meta = STATUS_META[status];
    return (
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span className={`size-2 shrink-0 ${meta.tile}`} />
            <span className={`text-xs font-medium ${meta.text}`}>
                {meta.label}
            </span>
        </span>
    );
};

const SuggestionRow = ({
    suggestion,
    onResolve,
}: {
    suggestion: EmailSuggestion;
    onResolve: (id: string, accept: boolean) => void;
}) => {
    const [isPending, startTransition] = useTransition();

    const resolve = (accept: boolean) =>
        startTransition(() => onResolve(suggestion.id, accept));

    return (
        <li className="flex flex-col gap-3 border-b border-faint px-4 py-4 last:border-b-0">
            <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">
                        {suggestion.company}
                    </span>
                    <span className="inline-flex max-w-32 shrink-0 items-center gap-1 text-xs text-muted">
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--list] size-3 shrink-0"
                        />
                        <span className="truncate">{suggestion.listName}</span>
                    </span>
                </div>
                <a
                    href={gmailMessageUrl(suggestion.messageId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open the original email in Gmail"
                    className="mt-1 inline-flex min-h-10 max-w-full items-center gap-1.5 text-xs text-sub underline decoration-hairline underline-offset-3 transition-[color,text-decoration-color] hover:text-ink hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <span className="truncate">{suggestion.subject}</span>
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--external-link] size-3 shrink-0"
                    />
                </a>
            </div>
            <div className="flex max-w-full items-center gap-2 self-start bg-surface px-3 py-2.5">
                <StatusPill status={suggestion.currentStatus} />
                <span
                    aria-hidden="true"
                    className="icon-[lucide--arrow-right] size-3.5 shrink-0 text-muted"
                />
                <StatusPill status={suggestion.suggestedStatus} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-faint pt-3">
                <button
                    type="button"
                    onClick={() => resolve(false)}
                    disabled={isPending}
                    className="focus-frame inline-flex h-10 cursor-pointer items-center border border-hairline bg-background px-4 text-sm text-sub transition-[background-color,color,transform] hover:bg-surface hover:text-ink active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Dismiss
                </button>
                <button
                    type="button"
                    onClick={() => resolve(true)}
                    disabled={isPending}
                    className="inline-flex h-10 cursor-pointer items-center bg-accent px-4 text-sm font-medium text-background transition-[background-color,transform] hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                >
                    Apply
                </button>
            </div>
        </li>
    );
};

type EmailSyncPopoverProps = {
    panel: EmailSyncPanel;
    suggestions: EmailSuggestion[];
    needsReconnect: boolean;
    isConnecting: boolean;
    isSyncing: boolean;
    open: boolean;
    onConnect: () => void;
    onSync: () => void;
    onResolve: (id: string, accept: boolean) => void;
};

const EmailSyncPopover = ({
    panel,
    suggestions,
    needsReconnect,
    isConnecting,
    isSyncing,
    open,
    onConnect,
    onSync,
    onResolve,
}: EmailSyncPopoverProps) => (
    <div
        data-open={open ? true : undefined}
        className="popup absolute right-0 top-full z-50 mt-2 w-full flex-col border border-hairline bg-background shadow-sm sm:w-[28rem]"
    >
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
            <div className="flex min-w-0 items-center gap-2">
                <span
                    aria-hidden="true"
                    className="icon-[lucide--mail] size-4 shrink-0 text-accent"
                />
                <h2 className="shrink-0 whitespace-nowrap text-sm font-medium text-ink">
                    Inbox sync
                </h2>
                {!needsReconnect && panel.connected && panel.lastSyncedAt ? (
                    <span className="truncate text-xs text-muted">
                        Synced{" "}
                        <LocalDateTime dateTime={panel.lastSyncedAt}>
                            {formatRelative(new Date(panel.lastSyncedAt))}
                        </LocalDateTime>
                    </span>
                ) : null}
            </div>
            {!panel.enabled ? (
                <span className="shrink-0 text-xs text-muted">Unavailable</span>
            ) : needsReconnect ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-rose">
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--circle-alert] size-3.5"
                    />
                    Needs attention
                </span>
            ) : panel.connected ? (
                <button
                    type="button"
                    onClick={onSync}
                    disabled={isSyncing}
                    className="focus-frame inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border border-hairline bg-background px-3 text-sm text-ink transition-[border-color,transform] hover:border-tile-border active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <span
                        aria-hidden="true"
                        className={`icon-[lucide--refresh-cw] size-3.5 ${isSyncing ? "animate-spin" : ""}`}
                    />
                    {isSyncing ? "Syncing" : "Sync now"}
                </button>
            ) : (
                <span className="shrink-0 text-xs text-muted">
                    Not connected
                </span>
            )}
        </div>

        {!panel.enabled ? (
            <p className="px-4 py-6 text-sm text-sub">
                Inbox sync isn&apos;t available right now. Please try again
                later.
            </p>
        ) : needsReconnect ? (
            <div className="px-4 py-5">
                <div className="flex items-start gap-3">
                    <span
                        aria-hidden="true"
                        className="icon-[simple-icons--google] mt-0.5 size-4 shrink-0 text-ink"
                    />
                    <div className="min-w-0">
                        <h3 className="text-balance text-sm font-semibold text-ink">
                            Reconnect Gmail
                        </h3>
                        <p className="mt-1 text-pretty text-xs leading-5 text-sub">
                            Your Gmail connection has ended. Reconnect to keep
                            checking for updates. Access remains read-only.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 bg-accent px-4 text-sm font-medium text-background transition-[background-color,transform] hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[simple-icons--google] size-4"
                    />
                    {isConnecting ? "Connecting" : "Reconnect Gmail"}
                </button>
            </div>
        ) : panel.connected ? (
            suggestions.length > 0 ? (
                <ul className="max-h-[60vh] overflow-y-auto">
                    {suggestions.map((suggestion) => (
                        <SuggestionRow
                            key={suggestion.id}
                            suggestion={suggestion}
                            onResolve={onResolve}
                        />
                    ))}
                </ul>
            ) : (
                <p className="px-4 py-6 text-center text-sm text-sub">
                    No changes to review. Sync to check your inbox for
                    application updates.
                </p>
            )
        ) : (
            <div className="px-4 py-5">
                <h3 className="text-sm font-semibold text-balance text-ink">
                    Before you connect Gmail
                </h3>
                <div className="mt-3 space-y-3 text-pretty text-xs leading-5 text-sub">
                    <p>
                        Job Tracker can read recent Gmail messages to look for
                        job application updates. It cannot send, edit, or delete
                        email.
                    </p>
                    <p>
                        To look for updates, Job Tracker sends relevant email
                        content and your application details to Google Gemini.
                    </p>
                    <p>
                        Job Tracker only saves the details needed to show a
                        suggestion, not a full copy of the email. Nothing
                        changes until you approve it. See the{" "}
                        <Link
                            href="/privacy#gmail"
                            className="font-medium text-accent-deep underline decoration-hairline underline-offset-3 transition-colors hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Privacy Policy
                        </Link>
                        .
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="mt-5 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 bg-accent px-4 text-sm font-medium text-background transition-[background-color,transform] hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[simple-icons--google] size-4"
                    />
                    {isConnecting ? "Connecting" : "Connect Gmail"}
                </button>
            </div>
        )}
    </div>
);

const EmailSyncTrigger = ({
    count,
    open,
    onToggle,
}: {
    count: number;
    open: boolean;
    onToggle: () => void;
}) => (
    <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="focus-frame relative inline-flex h-8 w-8 cursor-pointer items-center justify-center gap-2 border border-hairline bg-background text-sm text-ink transition-colors after:absolute after:-inset-1 after:content-[''] hover:border-tile-border sm:w-36 sm:justify-start sm:pr-3 sm:pl-2.5 sm:after:inset-x-0"
    >
        <span
            aria-hidden="true"
            className="icon-[lucide--mail] size-4 shrink-0 text-accent"
        />
        <span className="hidden sm:inline">Inbox sync</span>
        {count > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center bg-accent px-1 text-xs font-medium tabular-nums text-background sm:ml-auto">
                {count}
            </span>
        )}
    </button>
);

export const EmailSyncMenu = ({ panel }: { panel: EmailSyncPanel }) => {
    const router = useRouter();
    const [isConnecting, startConnect] = useTransition();
    const [isSyncing, startSync] = useTransition();
    const [needsReconnect, setNeedsReconnect] = useState(false);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const [suggestions, setSuggestions] = useState<EmailSuggestion[]>(
        panel.suggestions,
    );

    // The URL never changes here, so re-sync local state when a server refresh
    // delivers a new set of suggestions (e.g. right after a sync).
    const [committed, setCommitted] = useState(panel.suggestions);
    if (panel.suggestions !== committed) {
        setCommitted(panel.suggestions);
        setSuggestions(panel.suggestions);
    }

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const count = suggestions.length;

    const connect = () =>
        startConnect(async () => {
            await authClient.linkSocial({
                provider: "google",
                scopes: [GMAIL_READONLY_SCOPE],
                callbackURL: "/dashboard",
            });
        });

    const sync = () =>
        startSync(async () => {
            const result = await syncInbox();
            if (result.ok) {
                setNeedsReconnect(false);
                toast.success(emailSyncSuccessMessage(result));
                router.refresh();
            } else {
                const reconnect =
                    result.reason === "not_connected" ||
                    result.reason === "auth_expired";
                if (reconnect) setNeedsReconnect(true);
                toast.error(
                    result.message,
                    reconnect
                        ? {
                              action: {
                                  label: "Reconnect",
                                  onClick: connect,
                              },
                          }
                        : undefined,
                );
            }
        });

    const onResolve = (id: string, accept: boolean) => {
        setSuggestions((current) => current.filter((s) => s.id !== id));
        void (async () => {
            if (accept) {
                await acceptSuggestion(id, browserTimeZone());
                toast.success(EMAIL_SYNC_COPY.statusUpdated);
            } else {
                await dismissSuggestionAction(id);
            }
            router.refresh();
        })();
    };

    return (
        <div ref={ref} className="static sm:relative">
            <EmailSyncTrigger
                count={count}
                open={open}
                onToggle={() => setOpen((previous) => !previous)}
            />
            <EmailSyncPopover
                panel={panel}
                suggestions={suggestions}
                needsReconnect={needsReconnect}
                isConnecting={isConnecting}
                isSyncing={isSyncing}
                open={open}
                onConnect={connect}
                onSync={sync}
                onResolve={onResolve}
            />
        </div>
    );
};
