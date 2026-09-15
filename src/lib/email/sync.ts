import {
    completeEmailSyncMessages,
    countPendingEmailSyncMessages,
    getApplicationsForUser,
    getEmailSyncState,
    listPendingEmailSyncMessageIds,
    stageEmailSyncMessages,
    type EmailSuggestionInput,
    type UserApplication,
} from "@/db/email";
import {
    EmailHistoryExpiredError,
    type EmailDiscovery,
    type EmailProvider,
} from "@/lib/email/types";

const INITIAL_EMAIL_LIMIT = 100;
const INITIAL_LOOKBACK_DAYS = 90;
const HISTORY_PAGE_LIMIT = 500;
const PROCESSING_BATCH_LIMIT = 25;
const MAX_MESSAGES_PER_SYNC = 100;

export type EmailSyncOutcome = {
    found: number;
    scanned: number;
    remaining: number;
    hasMore: boolean;
    rebuiltHistory: boolean;
    initialScanLimited: boolean;
};

const initialDiscovery = (provider: EmailProvider): Promise<EmailDiscovery> =>
    provider.discoverRecent({
        maxResults: INITIAL_EMAIL_LIMIT,
        newerThanDays: INITIAL_LOOKBACK_DAYS,
    });

export const syncEmailInbox = async (
    userId: string,
    provider: EmailProvider,
): Promise<EmailSyncOutcome> => {
    const state = await getEmailSyncState(userId);
    let rebuiltHistory = !state.historyId;
    let discovery: EmailDiscovery;

    try {
        discovery = state.historyId
            ? await provider.discoverSince(state.historyId, HISTORY_PAGE_LIMIT)
            : await initialDiscovery(provider);
    } catch (error) {
        if (!(error instanceof EmailHistoryExpiredError)) throw error;
        rebuiltHistory = true;
        discovery = await initialDiscovery(provider);
    }

    await stageEmailSyncMessages(
        userId,
        discovery.messageIds,
        discovery.historyId,
    );

    let applications: UserApplication[] | null = null;
    let found = 0;
    let scanned = 0;
    let processed = 0;

    while (processed < MAX_MESSAGES_PER_SYNC) {
        const batchLimit = Math.min(
            PROCESSING_BATCH_LIMIT,
            MAX_MESSAGES_PER_SYNC - processed,
        );
        const messageIds = await listPendingEmailSyncMessageIds(
            userId,
            batchLimit,
        );
        if (messageIds.length === 0) break;

        const emailsPromise = provider.fetchMessages(messageIds);
        const applicationsForBatch: UserApplication[] =
            applications ?? (await getApplicationsForUser(userId));
        applications = applicationsForBatch;
        const emails = await emailsPromise;
        const { classifyEmails } = await import("@/lib/email/classify");
        const matches = await classifyEmails(
            applicationsForBatch.map((application) => ({
                company: application.company,
                role: application.role,
                currentStatus: application.status,
            })),
            emails,
        );

        const bestMatches = new Map<string, (typeof matches)[number]>();
        for (const match of matches) {
            const email = emails[match.emailIndex];
            const application = applicationsForBatch[match.applicationIndex];
            if (!email || !application) continue;
            if (application.status === match.suggestedStatus) continue;

            const key = `${application.id}\u0000${email.id}`;
            const previous = bestMatches.get(key);
            if (!previous || previous.confidence < match.confidence) {
                bestMatches.set(key, match);
            }
        }

        const suggestions: EmailSuggestionInput[] = [
            ...bestMatches.values(),
        ].map((match) => {
            const email = emails[match.emailIndex];
            const application = applicationsForBatch[match.applicationIndex];
            return {
                applicationId: application.id,
                messageId: email.id,
                from: email.from,
                subject: email.subject,
                snippet: email.snippet,
                receivedAt: email.receivedAt,
                currentStatus: application.status,
                suggestedStatus: match.suggestedStatus,
                confidence: match.confidence,
                reasoning: match.reasoning,
            };
        });
        found += await completeEmailSyncMessages(
            userId,
            messageIds,
            suggestions,
        );
        scanned += emails.length;
        processed += messageIds.length;

        // Discovery has already staged every ID, so a short batch means the
        // local backlog is drained without another database round trip.
        if (messageIds.length < batchLimit) break;
    }

    if (processed === 0) {
        await completeEmailSyncMessages(userId, [], []);
    }
    const remaining = await countPendingEmailSyncMessages(userId);

    return {
        found,
        scanned,
        remaining,
        hasMore: remaining > 0 || (!rebuiltHistory && discovery.hasMore),
        rebuiltHistory,
        initialScanLimited: rebuiltHistory && discovery.hasMore,
    };
};
