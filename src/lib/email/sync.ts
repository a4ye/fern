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
import { candidatesFor } from "@/lib/email/candidates";
import type { EmailMatch } from "@/lib/email/matches";
import { MAX_EMAILS_PER_SYNC } from "@/lib/limits";

const INITIAL_LOOKBACK_DAYS = 90;

// Gmail's own ceiling on one page of history, so a delta cannot queue more than
// this however far behind the cursor is. Nothing is lost by stopping here: the
// cursor only advances to the last record staged, so the next sync resumes.
const HISTORY_PAGE_LIMIT = 500;

// Messages per model call, and per round of Gmail reads. Gmail allows one
// account 250 quota units a second and a message read costs 5, so 25 at once
// spends half of that. Raising it also hands the model more indexes to keep
// straight in a single prompt.
const PROCESSING_BATCH_LIMIT = 25;

export type EmailSyncOutcome = {
    found: number;
    scanned: number;
    remaining: number;
    hasMore: boolean;
    rebuiltHistory: boolean;
    initialScanLimited: boolean;
};

// A first sync discovers exactly what one sync can then work through, so the
// scan never stages mail it has no chance of reading.
const initialDiscovery = (provider: EmailProvider): Promise<EmailDiscovery> =>
    provider.discoverRecent({
        maxResults: MAX_EMAILS_PER_SYNC,
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

    while (processed < MAX_EMAILS_PER_SYNC) {
        const batchLimit = Math.min(
            PROCESSING_BATCH_LIMIT,
            MAX_EMAILS_PER_SYNC - processed,
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

        // Only the applications one of these emails names, and only the emails
        // that name one. A tracked list runs to thousands and a batch carries
        // twenty-five whole message bodies, so handing over both in full buries
        // the few that matter. A batch where the two never meet leaves nothing
        // to ask about, so the call is not made at all.
        const candidates = candidatesFor(applicationsForBatch, emails);

        let matches: EmailMatch[] = [];
        if (candidates.applications.length > 0) {
            const { classifyEmails } = await import("@/lib/email/classify");
            matches = await classifyEmails(
                candidates.applications.map((application) => ({
                    company: application.company,
                    role: application.role,
                    currentStatus: application.status,
                })),
                candidates.emails,
            );
        }

        // Every suggestion is a question put to the user, and two ways of
        // asking the same one are worth no more than the clearest. A batch
        // repeats itself when the model reads one email against an application
        // twice, and when a company announces a single decision over several
        // emails. Taking the confident matches first settles both, so the mail
        // that states a move most plainly is the one shown.
        const claimed = new Set<string>();
        const suggestions: EmailSuggestionInput[] = [];
        for (const match of [...matches].sort(
            (left, right) => right.confidence - left.confidence,
        )) {
            const email = candidates.emails[match.emailIndex];
            const application = candidates.applications[match.applicationIndex];
            if (!email || !application) continue;
            // Landing on the status already held is a second round at that
            // step, which is a real move, or it is another email about the
            // step the application is already on, which is nothing.
            if (
                application.status === match.suggestedStatus &&
                !match.newRound
            ) {
                continue;
            }

            const perEmail = `email ${application.id} ${email.id}`;
            const perMove = `move ${application.id} ${match.suggestedStatus}`;
            if (claimed.has(perEmail) || claimed.has(perMove)) continue;
            claimed.add(perEmail);
            claimed.add(perMove);

            suggestions.push({
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
            });
        }
        found += await completeEmailSyncMessages(
            userId,
            messageIds,
            suggestions,
        );
        // What the model was actually given, which is what it is paid for.
        // Messages the narrowing dropped were read from the inbox but never
        // sent on, and are counted by `processed` like any other.
        scanned += candidates.emails.length;
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
