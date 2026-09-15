import {
    auth,
    emailSyncEnabled,
    getViewAs,
    GOOGLE_PROVIDER_ID,
} from "@/lib/auth";
import { getLastSyncedAt, listPendingSuggestions } from "@/db/email";
import type { EmailSyncPanel } from "@/components/dashboard/data";
import { isEmailSyncApproved } from "@/lib/email/access";

// Assembles the dashboard's email panel: whether the feature is configured,
// whether this user has linked Google, when they last synced, and any pending
// suggestions to review.
export const loadEmailPanel = async (
    userId: string,
    userEmail: string,
    headers: Headers,
): Promise<EmailSyncPanel | null> => {
    if (!isEmailSyncApproved(userEmail)) return null;

    // Whether Google is linked is read from the browser's own session below,
    // which while viewing another account is the admin's rather than theirs.
    // Their inbox is not on offer either way, so the panel is left out.
    if (await getViewAs()) return null;

    if (!emailSyncEnabled) {
        return {
            enabled: false,
            connected: false,
            lastSyncedAt: null,
            suggestions: [],
        };
    }

    const accounts = await auth.api.listUserAccounts({ headers });
    const connected = accounts.some(
        (account) => account.providerId === GOOGLE_PROVIDER_ID,
    );

    if (!connected) {
        return {
            enabled: true,
            connected: false,
            lastSyncedAt: null,
            suggestions: [],
        };
    }

    const [lastSyncedAt, suggestions] = await Promise.all([
        getLastSyncedAt(userId),
        listPendingSuggestions(userId),
    ]);

    return {
        enabled: true,
        connected: true,
        lastSyncedAt,
        suggestions,
    };
};
