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

const suggestionRows = (inputs: EmailSuggestionInput[]): string =>
    JSON.stringify(
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
    );

export const insertEmailSuggestions = async (
    userId: string,
    inputs: EmailSuggestionInput[],
): Promise<number> => {
    if (inputs.length === 0) return 0;
    const rows = await gen.insertEmailSuggestions(getPool(), {
        userId,
        rows: suggestionRows(inputs),
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
        messageId: row.messageId,
        subject: row.emailSubject,
        currentStatus: row.currentStatus as ApplicationStatus,
        suggestedStatus: row.suggestedStatus as ApplicationStatus,
    }));
};

export const countPendingSuggestions = async (
    userId: string,
): Promise<number> => {
    const row = await gen.countPendingSuggestions(getPool(), { userId });
    return row?.total ?? 0;
};

export type EmailSyncState = {
    lastSyncedAt: string | null;
    historyId: string | null;
};

export const getEmailSyncState = async (
    userId: string,
): Promise<EmailSyncState> => {
    const row = await gen.getEmailSyncState(getPool(), { userId });
    return {
        lastSyncedAt: row?.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
        historyId: row?.historyId ?? null,
    };
};

export const getLastSyncedAt = async (userId: string): Promise<string | null> =>
    (await getEmailSyncState(userId)).lastSyncedAt;

// Discovery and cursor advancement are one transaction: once Gmail's bookmark
// moves forward, every message before it is already represented in the local
// backlog, including messages that did not fit in this processing batch.
export const stageEmailSyncMessages = async (
    userId: string,
    messageIds: string[],
    historyId: string,
): Promise<void> => {
    await withTransaction(async (client) => {
        if (messageIds.length > 0) {
            await gen.insertEmailSyncMessages(client, {
                userId,
                messageIds: JSON.stringify(messageIds),
            });
        }
        await gen.setEmailSyncCursor(client, { userId, historyId });
    });
};

export const listPendingEmailSyncMessageIds = async (
    userId: string,
    limit: number,
): Promise<string[]> => {
    const rows = await gen.listPendingEmailSyncMessages(getPool(), {
        userId,
        rowLimit: limit,
    });
    return rows.map((row) => row.messageId);
};

export const countPendingEmailSyncMessages = async (
    userId: string,
): Promise<number> => {
    const row = await gen.countPendingEmailSyncMessages(getPool(), { userId });
    return row?.total ?? 0;
};

// Suggestions, processed markers, and the displayed sync time commit together.
// A failure leaves the message IDs pending so a later sync can retry them.
export const completeEmailSyncMessages = async (
    userId: string,
    messageIds: string[],
    suggestions: EmailSuggestionInput[],
): Promise<number> =>
    withTransaction(async (client) => {
        const inserted =
            suggestions.length === 0
                ? []
                : await gen.insertEmailSuggestions(client, {
                      userId,
                      rows: suggestionRows(suggestions),
                  });
        if (messageIds.length > 0) {
            await gen.markEmailSyncMessagesProcessed(client, {
                userId,
                messageIds: JSON.stringify(messageIds),
            });
        }
        await gen.recordEmailSync(client, { userId });
        return inserted.length;
    });

export const recordEmailSync = async (userId: string): Promise<void> => {
    await gen.recordEmailSync(getPool(), { userId });
};

// Applies an accepted suggestion: flips the application's status and records the
// transition as an event, so it surfaces in the list's activity feed. Both are
// dated by the mail rather than the click, within the bounds each write holds
// it to. Returns false when the suggestion no longer exists or was already
// resolved.
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
                        occurredAt: suggestion.emailReceivedAt,
                        timeZone,
                    });
                    await gen.insertApplicationEvent(historyClient, {
                        applicationId: suggestion.applicationId,
                        fromStatus: application.status,
                        toStatus,
                        note: "Detected from email",
                        occurredAt: suggestion.emailReceivedAt,
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
