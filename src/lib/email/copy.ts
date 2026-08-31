export const EMAIL_SYNC_COPY = {
    signIn: "Sign in to check your inbox.",
    notApproved: "Inbox sync isn't available for this account.",
    unconfigured: "Inbox sync isn't available right now.",
    connectGoogle: "Connect Gmail to check your inbox.",
    accessExpired: "Reconnect Gmail to keep checking your inbox.",
    genericFailure: "Couldn't check your inbox. Please try again.",
    statusUpdated: "Status updated.",
} as const;

export type EmailSyncSuccessCopyInput = {
    found: number;
    hasMore: boolean;
    initialScanLimited: boolean;
};

export const emailSyncSuccessMessage = ({
    found,
    hasMore,
    initialScanLimited,
}: EmailSyncSuccessCopyInput): string => {
    const result =
        found === 0
            ? "No updates found"
            : `${found} update${found === 1 ? "" : "s"} found`;

    if (initialScanLimited) {
        return `${result} in your 100 most recent emails.`;
    }
    if (hasMore) return `${result}. Sync again to check the remaining emails.`;
    return `${result}.`;
};
