// Temporary, deny-by-default access gate for inbox sync. The allowlist stays on
// the server and uses exact email matches so a typo or partial match cannot grant
// access to another account.
export const isEmailSyncApproved = (
    email: string | null | undefined,
    approvedEmails: string | null | undefined = process.env
        .EMAIL_SYNC_APPROVED_EMAILS,
): boolean => {
    const candidate = email?.trim().toLowerCase();
    if (!candidate || !approvedEmails) return false;

    return approvedEmails
        .split(",")
        .some((approved) => approved.trim().toLowerCase() === candidate);
};
