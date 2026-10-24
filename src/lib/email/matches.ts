import type { ApplicationStatus } from "@/components/dashboard/data";
import type { NormalizedEmail } from "@/lib/email/types";

export type ClassifierApplication = {
    company: string;
    role: string | null;
    currentStatus: ApplicationStatus;
    // ISO date. When several rows for the same company are otherwise
    // indistinguishable, the model is told to pick the most recent one.
    appliedAt: string | null;
};

export type EmailMatch = {
    emailIndex: number;
    applicationIndex: number;
    suggestedStatus: ApplicationStatus;
    // A further round at the status the application already holds. Without this
    // a second interview is indistinguishable from a reminder about the first.
    newRound: boolean;
    confidence: number;
    // Absent where the classifier writes no text at all. Nothing renders this,
    // and the column it lands in is nullable.
    reasoning: string | null;
};

// One entry as the model returns it, before its indexes have been checked
// against the lists it was given.
export type RawMatch = {
    emailIndex: number;
    applicationIndex: number;
    suggestedStatus: string;
    newRound: boolean;
    confidence: number;
    reasoning: string | null;
};

// Statuses an application can genuinely hold twice. A second interview or a
// second assessment is a real step. A second rejection or a second offer is
// not, so a repeat of anything else is treated as another email about the step
// the application is already on.
const REPEATABLE_STATUSES = new Set<ApplicationStatus>([
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
]);

// How far through the hiring process each status sits. Statuses that share a
// rank are the same point reached by a different route: a company that runs a
// take-home after a phone screen has not gone backwards, so the middle of the
// funnel is deliberately flat and only the ends are ordered.
//
// "Ghosted" and "other" are left out. Neither says where an application got
// to, so neither can rule anything out: a reply to a ghosted application is
// exactly how one comes back to life.
const STAGE_RANK: Partial<Record<ApplicationStatus, number>> = {
    not_applied: 0,
    applied: 1,
    online_assessment: 2,
    takehome: 2,
    interviewing: 2,
    onsite: 2,
    offer_in_progress: 3,
    offer_accepted: 4,
    offer_declined: 4,
    offer_rescinded: 4,
    rejected: 4,
};

// An email cannot walk an application back down the funnel. The model is
// reading one message against a row whose history it cannot see, so a thread
// that quotes the application receipt under an offer, or a subject that names
// an interview held weeks ago, reads to it as the stage that mail is about.
// It is right about the stage and wrong about the move.
//
// Rejection stays reachable from anywhere, because it sits at the end: every
// rank is at or below it.
const movesForward = (
    current: ApplicationStatus,
    suggested: ApplicationStatus,
): boolean => {
    const from = STAGE_RANK[current];
    const to = STAGE_RANK[suggested];
    return from === undefined || to === undefined || to >= from;
};

// A company opens a round with a message of its own. What arrives in the
// thread about the round already arranged is the arranging: the time, the
// link, the reschedule. The model reads that thread whole, quoted history and
// all, so the earlier round's wording is in front of it and it answers that a
// further round was offered.
//
// Measured against every suggestion this inbox has produced, the three repeats
// that arrived as replies were all dismissed and the one that did not was
// accepted. The reply prefix is a proxy for the thread headers, which are not
// read today; it is the signal the stored suggestions can be checked against.
const isReply = (subject: string): boolean =>
    /^\s*(re|fwd?)\s*:/i.test(subject);

// Drops entries pointing outside the lists the model was given or back down
// the funnel, and bounds the repeat each one claims. The model is asked whether
// an email opens a further round but is not trusted to judge it: a claim that
// an application repeated a step it is not on, repeated a step nobody repeats,
// or opened a round in a reply, is a plain move.
export const usableMatches = (
    raw: RawMatch[],
    applications: ClassifierApplication[],
    emails: readonly Pick<NormalizedEmail, "subject">[],
): EmailMatch[] =>
    raw
        .filter(
            (match) =>
                match.emailIndex >= 0 &&
                match.emailIndex < emails.length &&
                match.applicationIndex >= 0 &&
                match.applicationIndex < applications.length &&
                movesForward(
                    applications[match.applicationIndex].currentStatus,
                    match.suggestedStatus as ApplicationStatus,
                ),
        )
        .map((match) => {
            const suggestedStatus = match.suggestedStatus as ApplicationStatus;
            return {
                emailIndex: match.emailIndex,
                applicationIndex: match.applicationIndex,
                suggestedStatus,
                newRound:
                    match.newRound &&
                    suggestedStatus ===
                        applications[match.applicationIndex].currentStatus &&
                    REPEATABLE_STATUSES.has(suggestedStatus) &&
                    !isReply(emails[match.emailIndex].subject),
                confidence: match.confidence,
                reasoning: match.reasoning,
            };
        });
