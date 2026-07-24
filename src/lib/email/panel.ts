import { auth, emailSyncEnabled, GOOGLE_PROVIDER_ID } from "@/lib/auth";
import {
    getLastSyncedAt,
    listPendingSuggestions,
} from "@/db/email";
import type { EmailSyncPanel } from "@/components/dashboard/data";

// Assembles the dashboard's email panel: whether the feature is configured,
// whether this user has linked Google, when they last synced, and any pending
// suggestions to review.
export const loadEmailPanel = async (
    userId: string,
    headers: Headers,
): Promise<EmailSyncPanel> => {
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

    return { enabled: true, connected: true, lastSyncedAt, suggestions };
};
