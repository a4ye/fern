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
    type NormalizedEmail,
} from "@/lib/email/types";
import { candidatesFor } from "@/lib/email/candidates";
import type { EmailMatch } from "@/lib/email/matches";
import { isAdministrativeNotice } from "@/lib/email/notices";
import { MAX_EMAILS_PER_SYNC } from "@/lib/limits";
import { DEFAULT_CLASSIFIER, type Classifier } from "@/lib/email/classifier";
import { createSyncProgress, type EmailSyncProgress } from "./progress";

const INITIAL_LOOKBACK_DAYS = 90;

// Gmail's own ceiling on one page of history, so a delta cannot queue more than
// this however far behind the cursor is. Nothing is lost by stopping here: the
// cursor only advances to the last record staged, so the next sync resumes.
const HISTORY_PAGE_LIMIT = 500;

// Messages per round of fetching and filtering. The Gmail provider subdivides
// these into smaller read rounds to limit simultaneous requests per mailbox.
const FETCH_BATCH_LIMIT = 25;

// Emails per model call. Raising it hands the model more indexes to keep
// straight in a single prompt; lowering it buys nothing, because a call costs
// about the same whether it carries five emails or twenty-five. The time goes
// on what the model writes, not on what it reads.
//
// Which is why groups are filled from the narrowing's survivors rather than
// from one Gmail round. A round of twenty-five leaves about eleven emails that
// name anybody tracked, so a group tied to a round would send every call less
// than half full and pay full price for it.
const CLASSIFY_GROUP_LIMIT = 25;

// Model calls in flight at once. A call is the longest thing in a sync by an
// order of magnitude and waits on nothing else in it, so the second one costs
// no wall clock. Held at two because the Gmail reads filling the next group
// already spend half the account's quota, and a third call would only queue
// behind the provider.
const CONCURRENT_CLASSIFY_LIMIT = 2;

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
    classifier: Classifier = DEFAULT_CLASSIFIER,
    onProgress?: (progress: EmailSyncProgress) => void,
): Promise<EmailSyncOutcome> => {
    const progress = createSyncProgress(onProgress, {
        groupSize: CLASSIFY_GROUP_LIMIT,
        concurrency: CONCURRENT_CLASSIFY_LIMIT,
    });
    progress.start();
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

    // Freeze this run's work before starting concurrent reviews. Pending IDs
    // remain pending until their review commits, so re-querying each round
    // could fetch the same waiting or in-flight messages again.
    const pending = await listPendingEmailSyncMessageIds(
        userId,
        MAX_EMAILS_PER_SYNC,
    );
    progress.discover(pending.length);

    let applications: UserApplication[] | null = null;
    let found = 0;
    let scanned = 0;
    let processed = 0;

    // One model call and the write that settles it. Suggestions, the processed
    // markers for the emails that produced them, and the sync time commit
    // together, so a call that never came back leaves its own emails pending
    // and nobody else's.
    const classifyGroup = async (
        group: NormalizedEmail[],
        tracked: UserApplication[],
    ): Promise<void> => {
        const reviewed = progress.review(group.length);
        // Only the applications one of these emails names. A tracked list runs
        // to thousands and a group carries twenty-five whole message bodies, so
        // handing over both in full buries the few that matter. Every email
        // here already named somebody, which is what put it in the group.
        const candidates = candidatesFor(tracked, group);

        let matches: EmailMatch[] = [];
        if (candidates.applications.length > 0) {
            // Loaded only once a group is actually going to be asked about,
            // and only the one in use: the Gemini path pulls an SDK in behind
            // it that a Jev sync has no reason to hold.
            const { classifyEmails } =
                classifier === "jev"
                    ? await import("@/lib/email/classify-jev")
                    : await import("@/lib/email/classify");
            matches = await classifyEmails(
                candidates.applications.map((application) => ({
                    company: application.company,
                    role: application.role,
                    currentStatus: application.status,
                    appliedAt: application.appliedAt,
                })),
                candidates.emails,
            );
        }

        // Every suggestion is a question put to the user, and two ways of
        // asking the same one are worth no more than the clearest. A group
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
            // The model reads every kept email beside every kept application,
            // so it can pin an email that names no employer on a company
            // another email in the group brought in: a co-op "you've been
            // matched" notice landing on the one offer in progress. Only a
            // company the email itself names is taken.
            if (!candidates.names(match.emailIndex, match.applicationIndex)) {
                continue;
            }
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

        // Read back into a local before adding, not `found += await ...`:
        // that reads `found` before it waits, so two calls in flight would
        // both start from the same number and one would lose its count.
        const inserted = await completeEmailSyncMessages(
            userId,
            group.map((email) => email.id),
            suggestions,
        );
        found += inserted;
        reviewed(inserted);
        // What the model was actually given, which is what it is paid for.
        // Messages the narrowing dropped were read from the inbox but never
        // sent on, and are counted by `processed` like any other.
        scanned += candidates.emails.length;
    };

    // Calls in flight, and the first failure among them. A group that throws
    // must take the sync down, the way a single serial call used to, but not
    // before the calls already running have finished their own writes: those
    // emails have been read and paid for either way.
    const running = new Set<Promise<void>>();
    let failure: unknown = null;

    const schedule = async (
        group: NormalizedEmail[],
        tracked: UserApplication[],
    ): Promise<void> => {
        while (running.size >= CONCURRENT_CLASSIFY_LIMIT) {
            await Promise.race(running);
        }
        const task = classifyGroup(group, tracked)
            .catch((error: unknown) => {
                failure ??= error;
            })
            .finally(() => {
                running.delete(task);
            });
        running.add(task);
    };

    // Emails the narrowing kept, held back until there are enough to fill a
    // call. Their IDs stay pending while they wait, so a sync that dies here
    // leaves them for the next one.
    const waiting: NormalizedEmail[] = [];

    try {
        while (processed < pending.length && !failure) {
            const messageIds = pending.slice(
                processed,
                processed + FETCH_BATCH_LIMIT,
            );

            const readStartedAt = Date.now();
            const emailsPromise = provider.fetchMessages(messageIds);
            const tracked: UserApplication[] =
                applications ?? (await getApplicationsForUser(userId));
            applications = tracked;
            const emails = await emailsPromise;

            // A company writing about its own record-keeping says nothing about
            // where an application stands, however much the mail sounds like a
            // decision. It is dropped before the narrowing rather than after
            // the model, because asking costs a whole message body and the
            // answer is known in advance.
            const readable = emails.filter(
                (email) => !isAdministrativeNotice(email),
            );
            const survivors = candidatesFor(tracked, readable).emails;
            waiting.push(...survivors);
            progress.read(
                messageIds.length,
                survivors.length,
                Date.now() - readStartedAt,
            );

            // Everything this round that no model call will ever read: the
            // notices, the mail naming nobody tracked, and any ID Gmail no
            // longer holds a message for. Settled now so it is never fetched
            // again, and settled apart from the survivors, whose IDs may not be
            // marked until the call that reads them has come back.
            const held = new Set(survivors.map((email) => email.id));
            const settled = messageIds.filter((id) => !held.has(id));
            if (settled.length > 0) {
                await completeEmailSyncMessages(userId, settled, []);
                progress.settle(settled.length);
            }

            processed += messageIds.length;

            while (waiting.length >= CLASSIFY_GROUP_LIMIT) {
                await schedule(
                    waiting.splice(0, CLASSIFY_GROUP_LIMIT),
                    tracked,
                );
            }
        }

        // Whatever never filled a group. One short call at the end of a sync is
        // the price of not leaving read mail unclassified until the next press.
        if (waiting.length > 0 && applications && !failure) {
            await schedule(waiting.splice(0), applications);
        }
    } finally {
        await Promise.all(running);
    }

    if (failure) throw failure;

    progress.finish();
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
