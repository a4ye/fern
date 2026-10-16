import { STATUS_META } from "@/components/dashboard/data";
import type { ApplicationStatus } from "@/components/dashboard/data";
import { askJev, estimateTokens, type JevCriterion } from "@/lib/typesafe";
import { takeSharedBudget } from "@/db/rate-limit";
import {
    TYPESAFE_INPUT_TOKENS_PER_SECOND,
    TYPESAFE_REQUESTS_PER_SECOND,
} from "@/lib/limits";
import { SUGGESTABLE_STATUSES } from "@/lib/email/statuses";
import {
    usableMatches,
    type ClassifierApplication,
    type EmailMatch,
} from "./matches";
import type { NormalizedEmail } from "./types";

// The same question the Gemini classifier answers, asked as typed judgments
// instead of a paragraph to parse. One request per email, each carrying every
// question that email needs, all answered against it at once.
//
// A batch is not one request here. Jev evaluates questions in parallel against
// a single state, so twenty-five unrelated emails in one state would make every
// question read twenty-four messages that are nothing to do with it and pay
// input tokens for all of them. Separate requests fired together are both
// faster and cheaper, and the rate limiter in the client is what holds them
// inside the published ceilings.

// Below this the email is reporting nothing, and no suggestion is raised. Set
// low on purpose: a missed move is a status the user has to notice and set by
// hand, while a wrong one is a row they wave away in the panel, so the two are
// not worth the same. Measured over a thousand messages of a real inbox, this
// reported every move that had already been confirmed by hand; the next step up
// lost one to save two suggestions.
const MOVED_THRESHOLD = 0.1;

// A refusal almost always recounts the stage it is refusing at: "thank you for
// taking our assessment, we are not moving ahead". Asked to pick one stage from
// a list, the answer is the stage those words are about. So rejection is asked
// separately and overrides the stage outright.
const DECLINED_THRESHOLD = 0.4;

// Whether a move onto the stage an application already holds is a genuine
// further round or another email about the round already arranged.
const NEW_ROUND_THRESHOLD = 0.5;

// The option meaning "this email is about none of them", which a Choice needs or
// it will always name somebody.
const NO_APPLICATION = "none";

// What each stage looks like in the mail announcing it. There is no "no change"
// option: whether the email reports a move at all is its own question, so this
// list is only ever read to name which move, and a politely worded rejection
// cannot lose to an abstention sitting beside it.
const STAGE_NOTES: Partial<Record<ApplicationStatus, JevCriterion>> = {
    applied: {
        what: "The company confirms it received the application.",
        examples: [
            "Thank you for applying",
            "We have received your application",
        ],
    },
    online_assessment: {
        what:
            "The applicant is asked to sit a timed test, coding challenge or " +
            "quiz, usually on an outside platform and with a deadline.",
        not_for: "A conversation with a person, which is an interview.",
        examples: [
            "HackerRank, Codility, CodeSignal, Criteria, a 'technical " +
                "assessment' or an 'online assessment' to complete by a date",
        ],
    },
    takehome: {
        what:
            "The applicant is asked to build or write something in their own " +
            "time and send it back.",
        not_for: "A timed test on a platform, which is an online assessment.",
        examples: ["A take-home exercise, project or assignment"],
    },
    interviewing: {
        what:
            "The applicant is invited to speak with somebody, or to book a " +
            "time to.",
        not_for:
            "Anything the applicant does alone with no interviewer present, " +
            "however the mail frames it. An email inviting them to 'the next " +
            "stage of our interview process' is not an interview when what " +
            "it goes on to ask for is a test or an assignment. Nor is a " +
            "reminder, reschedule or cancellation of a call already arranged.",
        examples: [
            "An interview invitation, a phone screen, a calendar link to book a call",
        ],
    },
    onsite: {
        what: "An in-person or final round, often several interviews in a day.",
    },
    offer_in_progress: {
        what: "An offer is extended, discussed, or sent to be reviewed or signed.",
    },
    offer_accepted: { what: "The applicant has accepted the offer." },
    offer_declined: { what: "The applicant has turned the offer down." },
    offer_rescinded: { what: "The company has withdrawn an offer it made." },
    rejected: {
        what:
            "The company is not going forward with this application. Counted " +
            "however gently it is put: the polite wording is the usual " +
            "wording, and the decision is still a rejection.",
        not_for:
            "A company tidying its records, such as a privacy, consent or " +
            "data retention notice, which decides nothing even where it says " +
            "the application details will be deleted.",
        examples: [
            "Thank you for your interest, but we have decided to move forward with other candidates",
            "We will not be progressing your application at this time",
            "Thank you for taking the time to complete our assessment; we are not moving ahead",
        ],
    },
};

const stageCriteria = (): Record<string, JevCriterion> => {
    const criteria: Record<string, JevCriterion> = {};
    for (const status of SUGGESTABLE_STATUSES) {
        criteria[status] = STAGE_NOTES[status] ?? {
            what: `The email reports the application reached ${STATUS_META[status].label.toLowerCase()}.`,
        };
    }
    return criteria;
};

// A Choice is keyed by its option names, so two rows at the same company need
// telling apart by something the model can also read. The role does it, and an
// index behind that for the case where even those match.
const labelFor = (
    application: ClassifierApplication,
    at: number,
    companyCounts: Map<string, number>,
): string => {
    if ((companyCounts.get(application.company) ?? 0) < 2) {
        return application.company;
    }
    return application.role
        ? `${application.company} (${application.role})`
        : `${application.company} #${at + 1}`;
};

const companyCriteria = (
    applications: ClassifierApplication[],
    labels: string[],
): Record<string, JevCriterion> => {
    const criteria: Record<string, JevCriterion> = {
        [NO_APPLICATION]: {
            what:
                "The email names none of the applications listed, or is not " +
                "about a job application at all.",
            examples: [
                "A general notice from a university, co-op office or job " +
                    "board that names no employer, even when it announces a " +
                    "match or a placement.",
            ],
        },
    };
    applications.forEach((application, at) => {
        criteria[labels[at]] = {
            what:
                `The email is about the application to ${application.company}` +
                (application.role ? ` for ${application.role}` : "") +
                `. Writing from the company's own domain is enough on its ` +
                `own, even where the mail never spells the name out, and so ` +
                `is a recruiter there writing personally. The domain is ` +
                `often a shortening of the name, dropping a word such as ` +
                `Financial or Labs.` +
                (application.appliedAt
                    ? ` Applied on ${application.appliedAt}.`
                    : ""),
            not_for:
                `Mail that neither comes from ${application.company} nor ` +
                `mentions it.`,
        };
    });
    return criteria;
};

// Sender, subject, snippet and body, named so each can be weighed for what it
// is. The body is the field that decides the hard cases: "we are pleased to
// invite you to the next stage" says which stage in its next sentence, and a
// snippet stops before it.
const stateFor = (email: NormalizedEmail) => ({
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    ...(email.body ? { body: email.body } : {}),
});

const askAbout = async (
    email: NormalizedEmail,
    emailIndex: number,
    applications: ClassifierApplication[],
    labels: string[],
    indexOf: Map<string, number>,
): Promise<EmailMatch | null> => {
    const { answers } = await askJev(stateFor(email), {
        company: {
            type: "choice",
            instructions:
                "Which tracked job application is this email about? Work the " +
                "company out from the sender's domain and from what the mail " +
                "says.",
            criteria: companyCriteria(applications, labels),
        },
        // The gate. Kept apart from the stage question because an abstention
        // competing against ten stages wins far too often: a rejection worded
        // kindly reads as nothing happening, and the move goes unreported.
        moved: {
            type: "noul",
            instructions:
                "This email tells the applicant that their application has " +
                "reached a new stage, or that it has ended.",
            criteria: {
                true:
                    "The email announces something about this application " +
                    "that has now happened: an invitation, a test to sit, an " +
                    "offer, or a decision not to go forward. A rejection " +
                    "counts however politely it is worded, including one that " +
                    "opens by thanking the applicant for their interest or " +
                    "for completing an assessment.",
                false:
                    "The email reports nothing new about where this " +
                    "application stands. A reminder, reschedule, " +
                    "cancellation or confirmation of something already " +
                    "arranged. A receipt saying a test the applicant just " +
                    "sat was received. The practical furniture of a step " +
                    "already under way: a link, a portal account, an event " +
                    "ID, a login, a technical difficulty. A privacy or data " +
                    "retention notice, a newsletter, a job alert. Anything " +
                    "not about a job application at all, such as payroll, " +
                    "invoicing, vendor or payment-details mail, or a place " +
                    "at a talk, workshop, hackathon or recruiting event, " +
                    "even when it comes from a company that is also being " +
                    "applied to. Being turned away from an event is not " +
                    "being turned down for a job.",
            },
        },
        declined: {
            type: "noul",
            instructions:
                "This email tells the applicant that the company is not " +
                "going forward with their application.",
            criteria: {
                true:
                    "The company has decided against this application, " +
                    "however warmly it says so, and whatever earlier stage " +
                    "the mail recounts on the way. Opening by thanking the " +
                    "applicant for their interest, for their time, or for " +
                    "completing an assessment is the usual way to begin one.",
                false:
                    "The application is still alive, or the mail is not " +
                    "about its outcome: an invitation, a test to sit, an " +
                    "offer, a reminder, or a notice about the company's own " +
                    "record-keeping.",
            },
        },
        newRound: {
            type: "noul",
            instructions:
                "This email opens a further, additional round at the same " +
                "stage the application has already reached, such as a second " +
                "interview or another assessment.",
            criteria: {
                true: "A new round is being arranged that is not the one already held.",
                false:
                    "A reminder, reschedule, cancellation, confirmation, " +
                    "calendar update or thank-you about a round already " +
                    "arranged, or a move to a different stage altogether.",
            },
        },
        stage: {
            type: "choice",
            instructions:
                "Assume this email does report a change to the application, " +
                "and that it is not a rejection, which is asked separately. " +
                "Which stage is it reporting? Answer for the step the mail " +
                "actually asks the applicant to do now. Not a step it looks " +
                "back on, not one it lists as coming later, and not the name " +
                "the company gives the whole hiring process. Companies " +
                "routinely call every stage part of their 'interview " +
                "process' while asking for a test or an assignment.",
            criteria: stageCriteria(),
        },
    });

    const choice = answers.company?.choice;
    if (!choice || choice === NO_APPLICATION) return null;
    const applicationIndex = indexOf.get(choice);
    if (applicationIndex === undefined) return null;

    const declined = answers.declined?.noul ?? 0;
    const moved = Math.max(answers.moved?.noul ?? 0, declined);
    if (moved < MOVED_THRESHOLD) return null;

    const stage =
        declined >= DECLINED_THRESHOLD ? "rejected" : answers.stage?.choice;
    if (!stage) return null;

    return {
        emailIndex,
        applicationIndex,
        suggestedStatus: stage as ApplicationStatus,
        newRound: (answers.newRound?.noul ?? 0) >= NEW_ROUND_THRESHOLD,
        // How sure the whole proposal is, which is both that something moved
        // and that it moved for this application. Either being shaky should
        // pull the figure down, so they multiply rather than average: the
        // panel sorts by this and keeps the plainest of two ways of saying
        // the same thing.
        confidence: moved * (answers.company?.confidence ?? 1),
        // Jev writes no text, by construction. The column is nullable and
        // nothing renders it, so there is nothing to put here and no reason
        // to invent a sentence that reads like one the model wrote.
        reasoning: null,
    };
};

export const classifyEmails = async (
    applications: ClassifierApplication[],
    emails: NormalizedEmail[],
): Promise<EmailMatch[]> => {
    if (applications.length === 0 || emails.length === 0) return [];

    const companyCounts = new Map<string, number>();
    for (const application of applications) {
        companyCounts.set(
            application.company,
            (companyCounts.get(application.company) ?? 0) + 1,
        );
    }
    const labels = applications.map((application, at) =>
        labelFor(application, at, companyCounts),
    );
    const indexOf = new Map(labels.map((label, at) => [label, at]));

    // The provider counts requests and input tokens against the whole
    // organisation, so the group is charged to a counter every instance shares
    // before any of it goes out. Refused means somebody else is mid-sync: the
    // emails stay pending and the next press picks them up, which is what
    // happens anyway when a group fails.
    const tokens = emails.reduce(
        (total, email) =>
            total + estimateTokens(JSON.stringify(stateFor(email))),
        0,
    );
    const [withinRequests, withinTokens] = await Promise.all([
        takeSharedBudget(
            "typesafe:requests",
            emails.length,
            TYPESAFE_REQUESTS_PER_SECOND,
            1,
        ),
        takeSharedBudget(
            "typesafe:tokens",
            tokens,
            TYPESAFE_INPUT_TOKENS_PER_SECOND,
            1,
        ),
    ]);
    if (!withinRequests || !withinTokens) {
        throw new Error(
            "The inbox classifier is at its rate limit. Try the sync again in a moment.",
        );
    }

    // One request per email, all in flight together. Nothing here waits on the
    // answer before it, and the client paces the set inside the same ceilings.
    const matches = await Promise.all(
        emails.map((email, at) =>
            askAbout(email, at, applications, labels, indexOf),
        ),
    );

    return usableMatches(
        matches.filter((match): match is EmailMatch => match !== null),
        applications,
        emails,
    );
};
