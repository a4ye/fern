"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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

// Gmail read-only scope, requested when the user links their Google account.
// Kept as a literal here so this client bundle never imports server auth code.
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const StatusPill = ({ status }: { status: ApplicationStatus }) => {
    const meta = STATUS_META[status];
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`size-2 shrink-0 ${meta.tile}`} />
            <span className={`text-sm ${meta.text}`}>{meta.label}</span>
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
        <li className="flex flex-col gap-2 border-b border-faint px-4 py-3 last:border-b-0">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                        {suggestion.company}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                        {suggestion.listName}
                    </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-sub">
                    {suggestion.subject}
                </p>
                {suggestion.reasoning && (
                    <p className="mt-1 text-xs text-muted">
                        {suggestion.reasoning}
                    </p>
                )}
            </div>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <StatusPill status={suggestion.currentStatus} />
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--arrow-right] size-3.5 shrink-0 text-muted"
                    />
                    <StatusPill status={suggestion.suggestedStatus} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => resolve(false)}
                        disabled={isPending}
                        className="inline-flex h-8 cursor-pointer items-center px-2.5 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Dismiss
                    </button>
                    <button
                        type="button"
                        onClick={() => resolve(true)}
                        disabled={isPending}
                        className="inline-flex h-8 cursor-pointer items-center bg-accent px-2.5 text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </li>
    );
};

export const EmailSyncMenu = ({ panel }: { panel: EmailSyncPanel }) => {
    const router = useRouter();
    const [isConnecting, startConnect] = useTransition();
    const [isSyncing, startSync] = useTransition();
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
                toast.success(
                    result.found > 0
                        ? `Found ${result.found} update${result.found === 1 ? "" : "s"} to review.`
                        : `Scanned ${result.scanned} emails. Nothing new.`,
                );
                router.refresh();
            } else {
                toast.error(result.message);
            }
        });

    const onResolve = (id: string, accept: boolean) => {
        setSuggestions((current) => current.filter((s) => s.id !== id));
        void (async () => {
            if (accept) {
                await acceptSuggestion(id, browserTimeZone());
                toast.success("Status updated.");
            } else {
                await dismissSuggestionAction(id);
            }
            router.refresh();
        })();
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="inline-flex h-8 cursor-pointer items-center gap-2 border border-hairline bg-background pr-3 pl-2.5 text-sm text-ink transition-colors hover:border-tile-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--mail] size-4 shrink-0 text-accent"
                />
                <span className="hidden sm:inline">Inbox sync</span>
                {count > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center bg-accent px-1 text-xs font-medium tabular-nums text-background">
                        {count}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] border border-hairline bg-background shadow-sm sm:w-96">
                    <div className="flex h-12 items-center justify-between gap-3 border-b border-hairline px-4">
                        <div className="flex min-w-0 items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--mail] size-4 shrink-0 text-accent"
                            />
                            <h2 className="text-sm font-medium text-ink">
                                Inbox sync
                            </h2>
                            {panel.connected && panel.lastSyncedAt && (
                                <span className="truncate text-xs text-muted">
                                    Synced{" "}
                                    {formatRelative(
                                        new Date(panel.lastSyncedAt),
                                    )}
                                </span>
                            )}
                        </div>
                        {!panel.enabled ? (
                            <span className="shrink-0 text-xs text-muted">
                                Setup required
                            </span>
                        ) : panel.connected ? (
                            <button
                                type="button"
                                onClick={sync}
                                disabled={isSyncing}
                                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border border-hairline bg-background px-3 text-sm text-ink transition-colors hover:border-tile-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`icon-[lucide--refresh-cw] size-3.5 ${isSyncing ? "animate-spin" : ""}`}
                                />
                                {isSyncing ? "Syncing" : "Sync now"}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={connect}
                                disabled={isConnecting}
                                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 bg-accent px-3 text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[simple-icons--google] size-3.5"
                                />
                                Connect Gmail
                            </button>
                        )}
                    </div>

                    {!panel.enabled ? (
                        <p className="px-4 py-6 text-sm text-sub">
                            Email sync isn&apos;t configured yet. Add{" "}
                            <code className="text-ink">GOOGLE_CLIENT_ID</code>,{" "}
                            <code className="text-ink">
                                GOOGLE_CLIENT_SECRET
                            </code>
                            , and{" "}
                            <code className="text-ink">
                                GOOGLE_GENERATIVE_AI_API_KEY
                            </code>{" "}
                            to your <code className="text-ink">.env</code>, then
                            restart the dev server to connect your inbox.
                        </p>
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
                                No changes to review. Sync to check your inbox
                                for application updates.
                            </p>
                        )
                    ) : (
                        <p className="px-4 py-6 text-sm text-sub">
                            Link your Gmail account to automatically detect
                            interview invites, offers, and rejections, then
                            review each change before it updates a status.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
