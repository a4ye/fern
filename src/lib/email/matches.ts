import type { ApplicationStatus } from "@/components/dashboard/data";

export type ClassifierApplication = {
    company: string;
    role: string | null;
    currentStatus: ApplicationStatus;
};

export type EmailMatch = {
    emailIndex: number;
    applicationIndex: number;
    suggestedStatus: ApplicationStatus;
    // A further round at the status the application already holds. Without this
    // a second interview is indistinguishable from a reminder about the first.
    newRound: boolean;
    confidence: number;
    reasoning: string;
};

// One entry as the model returns it, before its indexes have been checked
// against the lists it was given.
export type RawMatch = {
    emailIndex: number;
    applicationIndex: number;
    suggestedStatus: string;
    newRound: boolean;
    confidence: number;
    reasoning: string;
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

// Drops entries pointing outside the lists the model was given, and bounds the
// repeat each one claims. The model is asked whether an email opens a further
// round but is not trusted to judge it: a claim that an application repeated a
// step it is not on, or repeated a step nobody repeats, is a plain move.
export const usableMatches = (
    raw: RawMatch[],
    applications: ClassifierApplication[],
    emailCount: number,
): EmailMatch[] =>
    raw
        .filter(
            (match) =>
                match.emailIndex >= 0 &&
                match.emailIndex < emailCount &&
                match.applicationIndex >= 0 &&
                match.applicationIndex < applications.length,
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
                    REPEATABLE_STATUSES.has(suggestedStatus),
                confidence: match.confidence,
                reasoning: match.reasoning,
            };
        });
