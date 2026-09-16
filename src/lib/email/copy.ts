import { MAX_EMAILS_PER_SYNC } from "@/lib/limits";

export const EMAIL_SYNC_COPY = {
    syncCeiling: `Up to ${MAX_EMAILS_PER_SYNC} emails can be processed in one sync`,
    signIn: "Sign in to check your inbox.",
    notApproved: "Inbox sync isn't available for this account.",
    unconfigured: "Inbox sync isn't available right now.",
    connectGoogle: "Connect Gmail to check your inbox.",
    accessExpired: "Reconnect Gmail to keep checking your inbox.",
    genericFailure: "Couldn't check your inbox. Please try again.",
    statusUpdated: "Status updated.",
    signInToResolve: "Sign in to update your applications.",
    suggestionGone: "That suggestion is no longer there.",
    resolveFailed: "Couldn't save that change. Please try again.",
} as const;

export type EmailSyncSuccessCopyInput = {
    found: number;
    remaining: number;
    hasMore: boolean;
    initialScanLimited: boolean;
};

export const emailSyncSuccessMessage = ({
    found,
    remaining,
    hasMore,
    initialScanLimited,
}: EmailSyncSuccessCopyInput): string => {
    const result =
        found === 0
            ? "No updates found"
            : `${found} update${found === 1 ? "" : "s"} found`;

    // A counted backlog is worth more than either hedge below it, since it says
    // how much is left rather than only that something is.
    if (remaining > 0) {
        return `${result}. ${remaining} email${remaining === 1 ? "" : "s"} remaining to sync.`;
    }
    if (initialScanLimited) {
        return `${result} in your ${MAX_EMAILS_PER_SYNC} most recent emails.`;
    }
    if (hasMore) return `${result}. Sync again to check the remaining emails.`;
    return `${result}.`;
};
