import { getPool } from "@/db/client";
import * as gen from "@/db/queries";
import {
    STATUS_META,
    type ApplicationStatus,
    type EmailSuggestion,
} from "@/components/dashboard/data";

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

export const insertEmailSuggestion = async (input: {
    userId: string;
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
}): Promise<boolean> => {
    const row = await gen.insertEmailSuggestion(getPool(), {
        userId: input.userId,
        applicationId: input.applicationId,
        messageId: input.messageId,
        emailFrom: input.from,
        emailSubject: input.subject,
        emailSnippet: input.snippet,
        emailReceivedAt: input.receivedAt,
        currentStatus: input.currentStatus,
        suggestedStatus: input.suggestedStatus,
        confidence: input.confidence,
        reasoning: input.reasoning,
    });
    return row !== null;
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
): Promise<boolean> => {
    const pool = getPool();
    const suggestion = await gen.getSuggestionForUser(pool, {
        id: suggestionId,
        userId,
    });
    if (!suggestion) return false;

    const application = await gen.getApplicationForUser(pool, {
        applicationId: suggestion.applicationId,
        userId,
    });
    if (!application) return false;

    const toStatus = suggestion.suggestedStatus;
    if (isStatus(application.status) && application.status !== toStatus) {
        await gen.setApplicationStatus(pool, {
            applicationId: suggestion.applicationId,
            userId,
            status: toStatus,
        });
        await gen.insertApplicationEvent(pool, {
            applicationId: suggestion.applicationId,
            fromStatus: application.status,
            toStatus,
            note: "Detected from email",
        });
    }

    await gen.setSuggestionState(pool, {
        id: suggestionId,
        userId,
        state: "accepted",
    });
    return true;
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
