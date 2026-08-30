import { getPool, withTransaction } from "@/db/client";
import * as gen from "@/db/queries";
import {
    HISTORY_KIND,
    maintainHistoryAfterAction,
    recordApplicationChangeWithClient,
} from "@/db/history";
import {
    STATUS_META,
    type ApplicationStatus,
    type EmailSuggestion,
} from "@/components/dashboard/data";
import { MAX_EVENTS_PER_APPLICATION } from "@/lib/limits";

export type UserApplication = {
    id: string;
    company: string;
    role: string | null;
    status: ApplicationStatus;
};

export const getApplicationsForUser = async (
    userId: string,
): Promise<UserApplication[]> => {
    const rows = await gen.applicationsForUser(getPool(), { userId });
    return rows.map((row) => ({
        id: row.id,
        company: row.companyName,
        role: row.roleTitle,
        status: row.status as ApplicationStatus,
    }));
};

export type EmailSuggestionInput = {
    applicationId: string;
    messageId: string;
    from: string;
    subject: string;
    snippet: string;
    receivedAt: Date;
    currentStatus: ApplicationStatus;
    suggestedStatus: ApplicationStatus;
    confidence: number;
    reasoning: string | null;
};

export const insertEmailSuggestions = async (
    userId: string,
    inputs: EmailSuggestionInput[],
): Promise<number> => {
    if (inputs.length === 0) return 0;
    const rows = await gen.insertEmailSuggestions(getPool(), {
        userId,
        rows: JSON.stringify(
            inputs.map((input) => ({
                application_id: input.applicationId,
                message_id: input.messageId,
                email_from: input.from,
                email_subject: input.subject,
                email_snippet: input.snippet,
                email_received_at: input.receivedAt.toISOString(),
                current_status: input.currentStatus,
                suggested_status: input.suggestedStatus,
                confidence: input.confidence,
                reasoning: input.reasoning,
            })),
        ),
    });
    return rows.length;
};

const isStatus = (value: string): value is ApplicationStatus =>
    value in STATUS_META;

export const listPendingSuggestions = async (
    userId: string,
): Promise<EmailSuggestion[]> => {
    const rows = await gen.listPendingSuggestions(getPool(), { userId });
    return rows.map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        company: row.companyName,
        role: row.roleTitle,
        listId: row.listId,
        listName: row.listName,
        from: row.emailFrom,
        subject: row.emailSubject,
        snippet: row.emailSnippet,
        receivedAt: row.emailReceivedAt.toISOString(),
        currentStatus: row.currentStatus as ApplicationStatus,
        suggestedStatus: row.suggestedStatus as ApplicationStatus,
        confidence: row.confidence,
        reasoning: row.reasoning,
    }));
};

export const countPendingSuggestions = async (
    userId: string,
): Promise<number> => {
    const row = await gen.countPendingSuggestions(getPool(), { userId });
    return row?.total ?? 0;
};

export const getLastSyncedAt = async (
    userId: string,
): Promise<string | null> => {
    const row = await gen.getEmailSyncState(getPool(), { userId });
    return row?.lastSyncedAt ? row.lastSyncedAt.toISOString() : null;
};

export const recordEmailSync = async (userId: string): Promise<void> => {
    await gen.recordEmailSync(getPool(), { userId });
};

// Applies an accepted suggestion: flips the application's status and records the
// transition as an event, so it surfaces in the list's activity feed. Returns
// false when the suggestion no longer exists or was already resolved.
export const applySuggestion = async (
    userId: string,
    suggestionId: string,
    timeZone: string,
): Promise<boolean> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction(async (client) => {
        // Locking the pending suggestion makes concurrent Apply/Dismiss clicks
        // resolve it exactly once.
        const suggestion = await gen.getSuggestionForUser(client, {
            id: suggestionId,
            userId,
        });
        if (!suggestion) return false;

        const application = await gen.getApplicationForUser(client, {
            applicationId: suggestion.applicationId,
            userId,
        });
        if (!application) return false;

        // An application that has recorded as many moves as it keeps stops
        // moving, here as everywhere else. The suggestion is still resolved:
        // it has been dealt with either way.
        const events = await gen.countApplicationEvents(client, {
            applicationId: suggestion.applicationId,
            userId,
        });
        const hasRoom = (events?.total ?? 0) < MAX_EVENTS_PER_APPLICATION;

        const toStatus = suggestion.suggestedStatus;
        if (
            hasRoom &&
            isStatus(application.status) &&
            application.status !== toStatus
        ) {
            await recordApplicationChangeWithClient(client, {
                userId,
                applicationIds: [suggestion.applicationId],
                kind: HISTORY_KIND.status,
                onRecorded: (actionId) => {
                    recordedActionId = actionId;
                },
                mutation: async (historyClient, historyActionId) => {
                    await gen.setApplicationStatus(historyClient, {
                        applicationId: suggestion.applicationId,
                        userId,
                        status: toStatus,
                        timeZone,
                    });
                    await gen.insertApplicationEvent(historyClient, {
                        applicationId: suggestion.applicationId,
                        fromStatus: application.status,
                        toStatus,
                        note: "Detected from email",
                        historyActionId,
                    });
                },
            });
        }

        await gen.setSuggestionState(client, {
            id: suggestionId,
            userId,
            state: "accepted",
        });
        return true;
    });
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

export const dismissSuggestion = async (
    userId: string,
    suggestionId: string,
): Promise<void> => {
    await gen.setSuggestionState(getPool(), {
        id: suggestionId,
        userId,
        state: "dismissed",
    });
};
