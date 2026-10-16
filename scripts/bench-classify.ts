// Runs the inbox classifier against the suggestions this app has already put in
// front of someone, where the answer is on record: a suggestion that was
// accepted was right, and one that was dismissed was wrong. That makes the
// stored set a precision test, which is the thing worth measuring here, since
// every false positive is a question the user had to refuse.
//
// It measures nothing about recall. Mail that should have raised a suggestion
// and did not never reached the table, so no model can be scored on it from
// here. Read the numbers as "of what it proposes, how much is worth proposing".
//
//   bun run bench:classify            # Gemini, as production runs it today
//   bun run bench:classify jev        # Jev, one call per email
//   bun run bench:classify jev-batch  # Jev, one call per group of emails
//   bun run bench:classify all        # every engine, same cases, side by side
//
// Needs POSTGRES_URL, plus GOOGLE_GENERATIVE_AI_API_KEY or TYPESAFE_API_KEY for
// whichever engines are asked for.

import { getPool } from "../src/db/client";
import { candidatesFor } from "../src/lib/email/candidates";
import { isAdministrativeNotice } from "../src/lib/email/notices";
import { SUGGESTABLE_STATUSES } from "../src/lib/email/statuses";
import type { NormalizedEmail } from "../src/lib/email/types";
import {
    STATUS_META,
    type ApplicationStatus,
} from "../src/components/dashboard/data";
import {
    askJev,
    type JevCriterion,
    type JevQuestion,
} from "../src/lib/typesafe";

// Emails per Jev call in the batched variant. Matches CLASSIFY_GROUP_LIMIT in
// sync.ts so the two measure the same unit of work.
const JEV_GROUP_SIZE = 25;

// Gemini's free tier allows five generate_content calls a minute, and a run of
// forty cases meets that in the first ten seconds. Waiting it out keeps the
// comparison honest: without this the run dies partway and what survives is
// whatever the retries happened to land. It is a ceiling on the benchmark, not
// on a sync, which asks once per twenty-five emails rather than once per email.
const GEMINI_PACE_MS = 12_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A run takes minutes, and a free tier refuses a call now and then for reasons
// of its own: a spent quota, or a model "experiencing high demand". Letting one
// of those end the run throws away every case measured before it, so each case
// is retried on a widening wait, and a case nobody can answer is set aside and
// counted rather than guessed at.
const BACKOFF_MS = [15_000, 30_000, 60_000, 120_000];

// A daily quota says how long it wants to be left alone, and it is measured in
// hours. Waiting out the backoff changes nothing then, so the run says what is
// wrong and stops asking rather than spending four more minutes finding out.
const EXHAUSTED = /retry in\s+\d+h|retry in\s+\d+\s*(?:day|hour)/i;

const attempt = async <T>(
    label: string,
    run: () => Promise<T>,
): Promise<T | null> => {
    for (let tries = 0; ; tries += 1) {
        try {
            return await run();
        } catch (error) {
            const full = String(error instanceof Error ? error.message : error);
            const reason = full.replace(/\s+/g, " ").slice(0, 220);
            const wait = EXHAUSTED.test(full) ? undefined : BACKOFF_MS[tries];
            if (wait === undefined) {
                console.log(`\n${label} gave up: ${reason}`);
                return null;
            }
            console.log(`\n${label} retrying in ${wait / 1000}s: ${reason}`);
            await sleep(wait);
        }
    }
};

// The answer that means "this email reports no move", which both engines need a
// way to give. Without it a model asked to pick a status always picks one.
const NO_CHANGE = "no_change";
const NO_APPLICATION = "none";

// Where "the company turned this down" has to land to override the stage the
// mail talks about. A refusal is rarely coy once it is asked about directly,
// so this sits at the neutral point rather than low.
const DECLINED_THRESHOLD = 0.4;

// Where "this opens a further round" has to land before a move onto the stage
// already held counts as a real move rather than another mail about it.
const NEW_ROUND_THRESHOLD = 0.5;

type Case = {
    // The email as the suggestion recorded it. Bodies are not stored, so every
    // engine here reads the same three fields and none of them reads the body.
    // That is below what production gives Gemini, which is why the Gemini
    // column is a baseline on this input rather than a record of live accuracy.
    email: NormalizedEmail;
    company: string;
    role: string | null;
    currentStatus: ApplicationStatus;
    // What Gemini proposed when this suggestion was made, and whether the user
    // took it.
    proposed: ApplicationStatus;
    accepted: boolean;
};

type Verdict = {
    // Whether this email reports a move at all, asked on its own rather than as
    // one more option inside the stage question. Competing there, "no move" beats
    // a correct stage whenever the mail is polite about it, which is how a real
    // rejection goes unreported. Held as the raw probability so a threshold can
    // be swept over a finished run without asking the model again.
    //
    // Absent for engines with no separate presence judgment, which are then read
    // as proposing whatever status they named.
    moved?: number;
    // The stage it would report if it reports one, before any threshold.
    stage?: string | null;
    // How sure it is the company turned this application down, kept raw beside
    // `moved` so both gates can be read off a finished run.
    declined?: number;
    // Whether the mail opens a further round at the stage already held, which
    // is what tells a second interview from a reminder about the first.
    newRound?: number;
    // Input tokens the provider billed for this answer. Output is not charged.
    inputTokens?: number;
    // The status the engine settled on, or null for "no move reported".
    status: string | null;
    company: string | null;
    ms: number;
};

const loadCases = async (): Promise<Case[]> => {
    const { rows } = await getPool().query<{
        email_from: string;
        email_subject: string;
        email_snippet: string | null;
        email_received_at: Date;
        message_id: string;
        current_status: ApplicationStatus;
        suggested_status: ApplicationStatus;
        state: string;
        company_name: string;
        role_title: string | null;
    }>(
        `select s.email_from, s.email_subject, s.email_snippet,
                s.email_received_at, s.message_id, s.current_status,
                s.suggested_status, s.state, a.company_name, a.role_title
         from email_suggestions s
         join applications a on a.id = s.application_id
         where s.state in ('accepted', 'dismissed')
           -- Seeded rows carry a made-up decision on a made-up email, which
           -- would be scored here as though somebody had meant it. They are
           -- the ones db/seed-suggestions.ts wrote, and they are the reason
           -- this filter exists rather than a count of every answered row.
           and s.message_id not like 'seed-%'
         order by s.created_at`,
    );

    return rows.map((row) => ({
        email: {
            id: row.message_id,
            from: row.email_from,
            subject: row.email_subject,
            snippet: row.email_snippet ?? "",
            // The stored snippet is all there is. Leaving the body empty keeps
            // every engine on the same input rather than inventing one.
            body: "",
            receivedAt: row.email_received_at,
        },
        company: row.company_name,
        role: row.role_title,
        currentStatus: row.current_status,
        proposed: row.suggested_status,
        accepted: row.state === "accepted",
    }));
};

// The companies this email could be about, worked out the way a sync does it
// rather than handed the right answer. A case whose own company does not survive
// the narrowing is still kept and still counted: production would not have asked
// about it either, and an engine that proposes nothing there is correct.
const candidatesForCase = (
    item: Case,
    tracked: readonly string[],
): string[] => {
    const narrowed = candidatesFor(
        tracked.map((company) => ({ company })),
        [item.email],
    );
    const names = narrowed.applications.map((entry) => entry.company);
    return names.includes(item.company) ? names : [...names, item.company];
};

const loadTracked = async (): Promise<string[]> => {
    const { rows } = await getPool().query<{ company_name: string }>(
        "select distinct company_name from applications",
    );
    return rows.map((row) => row.company_name);
};

// --- Gemini, through the same function production calls ------------------

const runGemini = async (
    item: Case,
    candidates: string[],
): Promise<Verdict> => {
    const { classifyEmails } = await import("../src/lib/email/classify");
    const applications = candidates.map((company) => ({
        company,
        role: company === item.company ? item.role : null,
        currentStatus:
            company === item.company
                ? item.currentStatus
                : ("applied" as ApplicationStatus),
        appliedAt: null,
    }));

    const start = performance.now();
    const matches = await classifyEmails(applications, [item.email]);
    const ms = performance.now() - start;

    const best = matches.sort((a, b) => b.confidence - a.confidence)[0];
    return {
        status: best ? best.suggestedStatus : null,
        company: best ? applications[best.applicationIndex].company : null,
        ms,
    };
};

// --- Jev -----------------------------------------------------------------

// What each stage looks like in the mail that announces it. No "no change"
// option lives here: whether the email reports a move at all is its own
// question, so this one is only ever asked to name which move, and a polite
// rejection cannot lose to an abstention sitting in the same list.
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
        what: "The applicant is invited to speak with somebody, or to book a time to.",
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
            "After careful consideration we have chosen to pursue other applicants",
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

const companyCriteria = (
    candidates: string[],
): Record<string, JevCriterion> => {
    const criteria: Record<string, JevCriterion> = {
        [NO_APPLICATION]: {
            what:
                "The email names none of the companies listed, or is not " +
                "about a job application at all.",
            examples: [
                "A general notice from a university, co-op office or job " +
                    "board that names no employer, even when it announces a " +
                    "match or a placement.",
            ],
        },
    };
    for (const company of candidates) {
        criteria[company] = {
            what:
                `The email is about the application to ${company}. Writing ` +
                `from the company's own domain is enough on its own, even ` +
                `where the mail never spells the name out, and so is a ` +
                `recruiter there writing personally. The domain is often a ` +
                `shortening of the name, dropping a word such as Financial ` +
                `or Labs.`,
            not_for:
                `Mail that neither comes from ${company} nor mentions it. A ` +
                `company another email named is not a reason to pick it here.`,
        };
    }
    return criteria;
};

// What the model is shown. The body is the field that decides the hard cases:
// "we are pleased to invite you to the next stage" says which stage in its next
// sentence, and the snippet stops before it. Stored suggestions kept no body, so
// this is empty for them and full for anything read from the inbox.
const emailState = (email: NormalizedEmail) => ({
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    ...(email.body ? { body: email.body.slice(0, 4000) } : {}),
});

// One call per email, three independent questions over it. They cannot see one
// another's answers, so the stage question is asked speculatively: it says which
// stage this mail would be reporting, and `moved` decides separately whether it
// is reporting one at all. Code puts the two together.
const runJev = async (item: Case, candidates: string[]): Promise<Verdict> => {
    const { answers, ms, inputTokens } = await askJev(emailState(item.email), {
        company: {
            type: "choice",
            instructions:
                "Which tracked job application is this email about? Work the " +
                "company out from the sender's domain and from what the mail " +
                "says.",
            criteria: companyCriteria(candidates),
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
        // Rejection is an override, not one stage among ten. A refusal almost
        // always recounts the stage it is refusing at ("thank you for taking
        // our assessment, we are not moving ahead"), and asked to pick one
        // option the model picks the stage the words are about. Asked whether
        // the application was turned down, it answers that instead.
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
        // Production drops a move onto the stage an application already holds
        // unless it is a genuine further round, so without this every reminder
        // about an arranged interview would read as a repeat of it.
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

    const company = answers.company?.choice ?? null;
    const declined = answers.declined?.noul ?? 0;
    // The override runs before the stage answer is read at all.
    const stage =
        declined >= DECLINED_THRESHOLD
            ? "rejected"
            : (answers.stage?.choice ?? null);
    const moved = Math.max(answers.moved?.noul ?? 0, declined);
    return {
        company: company === NO_APPLICATION ? null : company,
        moved,
        declined,
        newRound: answers.newRound?.noul ?? 0,
        inputTokens,
        stage,
        // Filled in by the threshold sweep, which re-reads `moved` and `stage`.
        status: null,
        ms,
    };
};

// Every email in one state, each with its own pair of questions. Kept only to
// measure, not as a candidate: TypeSafe's own guidance is to put independent
// questions over SHARED state in one call, and twenty-five unrelated emails are
// not shared state. Every question here has to find its own email inside a
// block that is mostly other people's mail, and pays input tokens for all of it.
const runJevBatch = async (
    items: Case[],
    candidates: string[][],
): Promise<Verdict[]> => {
    const questions: Record<string, JevQuestion> = {};
    items.forEach((item, at) => {
        questions[`company_${at}`] = {
            type: "choice",
            instructions: `For EMAIL ${at} only: which tracked job application is it about? Never pick a company that email does not name.`,
            criteria: companyCriteria(candidates[at]),
        };
        questions[`moved_${at}`] = {
            type: "noul",
            instructions: `For EMAIL ${at} only: it tells the applicant their application reached a new stage, or that it has ended.`,
        };
        questions[`stage_${at}`] = {
            type: "choice",
            instructions: `For EMAIL ${at} only, assuming it does report a change: which stage is it reporting?`,
            criteria: stageCriteria(),
        };
    });

    const { answers, ms } = await askJev(
        items.map((item, at) => ({ email: at, ...emailState(item.email) })),
        questions,
    );

    // One call answered every email, so the time is shared between them.
    const each = ms / items.length;
    return items.map((_, at) => {
        const company = answers[`company_${at}`]?.choice ?? null;
        return {
            company: company === NO_APPLICATION ? null : company,
            moved: answers[`moved_${at}`]?.noul ?? 0,
            stage: answers[`stage_${at}`]?.choice ?? null,
            status: null,
            ms: each,
        };
    });
};

// --- Scoring -------------------------------------------------------------

// Where the presence judgment has to land before a move is reported at all.
// Low on purpose: a missed move is a status the user has to go and set by hand,
// while a wrong one is a row they wave away in the panel, so the two are not
// worth the same. The sweep below is what this was chosen from.
const MOVED_THRESHOLD = 0.1;

// Reads a verdict's raw answers into the proposal it actually makes. An engine
// with no presence judgment keeps whatever status it named.
const settle = (verdict: Verdict, threshold: number): Verdict =>
    verdict.moved === undefined
        ? verdict
        : {
              ...verdict,
              status:
                  verdict.moved >= threshold ? (verdict.stage ?? null) : null,
          };

// An accepted suggestion is right only if the engine proposes the same move on
// the same application. A dismissed one is right if the engine declines to
// propose that move at all, which it can do by naming no company, reporting no
// change, or landing somewhere else.
const isCorrect = (item: Case, verdict: Verdict): boolean =>
    item.accepted
        ? verdict.company === item.company && verdict.status === item.proposed
        : !(
              verdict.company === item.company &&
              verdict.status === item.proposed
          );

type Report = {
    engine: string;
    answered: number;
    correct: number;
    keptGood: number;
    goodTotal: number;
    droppedBad: number;
    badTotal: number;
    totalMs: number;
    median: number;
};

const median = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

// Rates are over the cases the engine actually answered. A case it never got an
// answer for is left out of both the numerator and the denominator, so a run
// that lost a few to a refusal still reports a rate that means something.
const score = (
    engine: string,
    cases: Case[],
    raw: (Verdict | null)[],
    wallClockMs: number,
    threshold = MOVED_THRESHOLD,
): Report => {
    const verdicts = raw.map((verdict) =>
        verdict ? settle(verdict, threshold) : null,
    );
    let correct = 0;
    let keptGood = 0;
    let droppedBad = 0;
    let goodTotal = 0;
    let badTotal = 0;
    let answered = 0;
    cases.forEach((item, at) => {
        const verdict = verdicts[at];
        if (!verdict) return;
        answered += 1;
        if (item.accepted) goodTotal += 1;
        else badTotal += 1;
        if (isCorrect(item, verdict)) {
            correct += 1;
            if (item.accepted) keptGood += 1;
            else droppedBad += 1;
        }
    });
    return {
        engine,
        answered,
        correct,
        keptGood,
        goodTotal,
        droppedBad,
        badTotal,
        totalMs: wallClockMs,
        median: median(
            verdicts
                .filter((verdict): verdict is Verdict => verdict !== null)
                .map((verdict) => verdict.ms),
        ),
    };
};

const pct = (part: number, whole: number) =>
    whole === 0 ? "-" : `${((part / whole) * 100).toFixed(0)}%`;

// What the gate costs at every setting, so the threshold is read off the data
// rather than picked. Misses are the moves the user would have to go and set by
// hand; wrong ones are rows they wave away in the panel.
const printSweep = (cases: Case[], raw: (Verdict | null)[]) => {
    if (!raw.some((verdict) => verdict?.moved !== undefined)) return;
    console.log("\nthreshold   misses   wrong raised   agrees");
    console.log("-".repeat(46));
    for (const threshold of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        const report = score("", cases, raw, 0, threshold);
        const missed = report.goodTotal - report.keptGood;
        const wrong = report.badTotal - report.droppedBad;
        console.log(
            `${threshold.toFixed(2).padStart(9)}   ` +
                `${`${missed}/${report.goodTotal}`.padStart(6)}   ` +
                `${`${wrong}/${report.badTotal}`.padStart(12)}   ` +
                `${pct(report.correct, report.answered).padStart(6)}` +
                `${threshold === MOVED_THRESHOLD ? "   <- in use" : ""}`,
        );
    }
};

const print = (reports: Report[], cases: number) => {
    console.log(`\n${cases} labelled cases\n`);
    const header = [
        "engine".padEnd(12),
        "answered".padStart(9),
        "agrees".padStart(8),
        "keeps good".padStart(11),
        "drops bad".padStart(10),
        "per call".padStart(10),
        "wall".padStart(9),
    ].join("  ");
    console.log(header);
    console.log("-".repeat(header.length));
    for (const report of reports) {
        console.log(
            [
                report.engine.padEnd(12),
                `${report.answered}/${cases}`.padStart(9),
                pct(report.correct, report.answered).padStart(8),
                `${report.keptGood}/${report.goodTotal}`.padStart(11),
                `${report.droppedBad}/${report.badTotal}`.padStart(10),
                `${Math.round(report.median)}ms`.padStart(10),
                `${(report.totalMs / 1000).toFixed(1)}s`.padStart(9),
            ].join("  "),
        );
    }
    console.log(
        "\nanswered: cases the engine returned anything for, which is what " +
            "every rate beside it is out of.\nagrees: matches what the user " +
            "decided. keeps good: accepted suggestions it would also raise. " +
            "drops bad:\ndismissed ones it would not raise. per call: median " +
            "time for one answer, the engine's own speed.\nwall: every case " +
            "start to finish, which for Gemini includes waiting out its rate " +
            "limit and so says\nmore about the quota than the model.",
    );
};

// Every case as the engine answered it, beside what the user decided. A rate on
// its own cannot be checked, and a harness wired up wrong reports one just as
// confidently as a harness wired up right. This is how the number gets read
// back against the mail it came from.
const printDetail = (
    engine: string,
    cases: Case[],
    verdicts: (Verdict | null)[],
) => {
    console.log(`\n${engine}, case by case\n`);
    cases.forEach((item, at) => {
        const verdict = verdicts[at];
        const said = verdict
            ? `${verdict.company ?? "no company"} / ${verdict.status ?? NO_CHANGE}`
            : "no answer";
        const gates =
            verdict?.moved === undefined
                ? ""
                : ` moved=${verdict.moved.toFixed(2)} decl=${(verdict.declined ?? 0).toFixed(2)}`;
        const mark = verdict && isCorrect(item, verdict) ? " " : "x";
        console.log(
            `${mark} ${(item.accepted ? "accepted" : "dismissed").padEnd(9)} ` +
                `${`${item.company} / ${item.proposed}`.padEnd(38).slice(0, 38)} ` +
                `-> ${said.padEnd(34).slice(0, 34)} ` +
                `${gates} ${item.email.subject.slice(0, 34)}`,
        );
    });
    console.log(
        "\nLeft is the suggestion as it was shown and what the user did with " +
            "it. Right is what this\nengine answered for the same mail. An x " +
            "marks the two disagreeing.",
    );
};

// --- Whole-inbox run -----------------------------------------------------

// The labelled set measures the engine on mail somebody already answered a
// question about. It cannot measure how often the engine raises a question
// nobody wanted, because mail that never produced a suggestion was never
// stored. This runs the real narrowing over a real inbox instead, so every
// suggestion that would reach the panel is counted, wanted or not.
const runCorpus = async (threshold: number, quiet = false, holdout = false) => {
    const { readFileSync, existsSync } = await import("node:fs");
    type Entry = NormalizedEmail & {
        receivedAt: string;
        label?: { company: string; status: string; accepted: boolean };
    };
    let corpus = JSON.parse(
        readFileSync("/tmp/fern-email-corpus.json", "utf8"),
    ) as Entry[];

    // Everything the criteria and thresholds above were written against is in
    // the saved tuning set. Holding it out leaves mail none of this was shaped
    // by, which is the only way to tell a rule that generalises from a rule
    // that was fitted to the examples in front of it.
    if (holdout) {
        const tunedPath = "/tmp/fern-corpus-tuned.json";
        if (!existsSync(tunedPath)) {
            throw new Error(
                `No tuning set at ${tunedPath}, so nothing can be held out ` +
                    `from it. Copy the corpus there before retuning.`,
            );
        }
        const seen = new Set(
            (JSON.parse(readFileSync(tunedPath, "utf8")) as Entry[]).map(
                (entry) => entry.id,
            ),
        );
        corpus = corpus.filter((entry) => !seen.has(entry.id));
    }

    // Companies with the stage each is on, because production drops a move onto
    // the stage an application already holds unless the mail opens a further
    // round. Scoring without that filter counts suggestions nobody would see.
    const { rows: held } = await getPool().query<{
        company_name: string;
        status: ApplicationStatus;
    }>(
        `select distinct on (company_name) company_name, status
         from applications order by company_name, updated_at desc`,
    );
    const statusOf = new Map(held.map((row) => [row.company_name, row.status]));
    const tracked = held.map((row) => row.company_name);
    const applications = tracked.map((company) => ({ company }));

    // Exactly what a sync drops before the model: the notices, then the mail
    // naming nobody tracked.
    const readable = corpus
        .map((entry) => ({ ...entry, receivedAt: new Date(entry.receivedAt) }))
        .filter((email) => !isAdministrativeNotice(email));
    const survivors = readable.filter(
        (email) => candidatesFor(applications, [email]).emails.length > 0,
    );

    if (!quiet) {
        console.log(
            `${corpus.length} emails read from the inbox, ` +
                `${readable.length} past the notice filter, ` +
                `${survivors.length} naming a tracked company and so reaching the model.`,
        );
    }

    const verdicts = await Promise.all(
        survivors.map((email) =>
            attempt(`corpus ${email.id}`, () =>
                runJev(
                    {
                        email,
                        company: email.label?.company ?? "",
                        role: null,
                        currentStatus: "applied" as ApplicationStatus,
                        proposed: "applied" as ApplicationStatus,
                        accepted: false,
                    },
                    candidatesFor(applications, [email]).applications.map(
                        (entry) => entry.company,
                    ),
                ),
            ),
        ),
    );

    let caughtGood = 0;
    let goodTotal = 0;
    const lines: string[] = [];

    // The rest of what sync.ts does with a match, so the count below is the
    // count that would reach the panel: a move onto the stage already held is
    // nothing unless a further round was opened, and one question per
    // application and per move is all anybody is asked.
    const claimed = new Set<string>();
    const shown: { company: string; status: string; subject: string }[] = [];

    survivors.forEach((email, at) => {
        const verdict = verdicts[at];
        if (!verdict) return;
        const settled = settle(verdict, threshold);
        const { company, status } = settled;

        let kept = false;
        if (company && status) {
            const current = statusOf.get(company);
            const repeat =
                current === status &&
                (settled.newRound ?? 0) < NEW_ROUND_THRESHOLD;
            const perMove = `move ${company} ${status}`;
            if (!repeat && !claimed.has(perMove)) {
                claimed.add(perMove);
                kept = true;
                shown.push({ company, status, subject: email.subject });
            }
        }

        if (email.label?.accepted) {
            goodTotal += 1;
            if (
                company === email.label.company &&
                status === email.label.status
            ) {
                caughtGood += 1;
            } else if (!quiet) {
                lines.push(
                    `  MISSED  ${email.label.company} / ${email.label.status} ` +
                        `-> ${company ?? "no company"} / ${status ?? NO_CHANGE}  ` +
                        `${email.subject.slice(0, 48)}`,
                );
            }
        } else if (kept && !quiet) {
            lines.push(
                `  ${`${company} / ${status}`.padEnd(42).slice(0, 42)} ${email.subject.slice(0, 46)}`,
            );
        }
    });
    const raised = shown.length;
    const raisedUnlabelled = lines;
    const tokens = verdicts.reduce(
        (total, verdict) => total + (verdict?.inputTokens ?? 0),
        0,
    );

    if (!quiet && raisedUnlabelled.length > 0) {
        console.log(
            `\nEvery suggestion this would put in the panel after the ` +
                `dedup and repeat filters, and every known move it would ` +
                `miss:\n`,
        );
        for (const line of raisedUnlabelled) console.log(line);
    }

    return {
        raised,
        caughtGood,
        goodTotal,
        reached: survivors.length,
        tokens,
        read: corpus.length,
    };
};

// --- Main ----------------------------------------------------------------

const main = async () => {
    const which = process.argv[2] ?? "gemini";
    const engines = which === "all" ? ["gemini", "jev", "jev-batch"] : [which];
    const detail = process.argv.includes("detail");

    // A whole-inbox run answers a different question from the labelled set and
    // prints its own table.
    if (which === "corpus") {
        const holdout = process.argv.includes("holdout");
        if (holdout) {
            console.log(
                "Holdout run: only mail that none of the criteria or " +
                    "thresholds were written against.",
            );
        }
        const result = await runCorpus(MOVED_THRESHOLD, false, holdout);
        // $0.042 a million input tokens, output free, as the key's dashboard
        // publishes it. Printed per thousand emails read because that is the
        // unit a sync is actually billed in.
        const dollars = (result.tokens / 1_000_000) * 0.042;
        const perThousand = (dollars / result.read) * 1000;
        console.log(
            `\n${result.reached} emails reached the model. ` +
                `${result.raised} suggestions raised, ` +
                `${result.caughtGood}/${result.goodTotal} known moves caught.`,
        );
        console.log(
            `${result.tokens.toLocaleString()} input tokens billed, ` +
                `$${dollars.toFixed(4)} for this run, ` +
                `$${perThousand.toFixed(4)} per thousand emails read.\n`,
        );
        console.log("threshold   known moves caught   suggestions raised");
        console.log("-".repeat(52));
        for (const threshold of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7]) {
            const sweep = await runCorpus(threshold, true, holdout);
            console.log(
                `${threshold.toFixed(2).padStart(9)}   ` +
                    `${`${sweep.caughtGood}/${sweep.goodTotal}`.padStart(18)}   ` +
                    `${String(sweep.raised).padStart(18)}` +
                    `${threshold === MOVED_THRESHOLD ? "   <- in use" : ""}`,
            );
        }
        await getPool().end();
        return;
    }

    const cases = await loadCases();
    if (cases.length === 0) {
        console.log(
            "No accepted or dismissed suggestions on record, so there is " +
                "nothing to score against. Run a sync and answer a few first.",
        );
        await getPool().end();
        return;
    }
    const tracked = await loadTracked();
    const candidates = cases.map((item) => candidatesForCase(item, tracked));
    console.log(
        `${cases.length} cases, ${tracked.length} tracked companies, ` +
            `median ${
                candidates.map((list) => list.length).sort((a, b) => a - b)[
                    Math.floor(candidates.length / 2)
                ]
            } candidates per email`,
    );

    const reports: Report[] = [];

    for (const engine of engines) {
        const start = performance.now();
        let verdicts: (Verdict | null)[];

        if (engine === "gemini") {
            // Sequential, which is how production asks today, and paced so the
            // free tier does not refuse most of the run.
            verdicts = [];
            for (const [at, item] of cases.entries()) {
                if (at > 0) await sleep(GEMINI_PACE_MS);
                verdicts.push(
                    await attempt(`gemini case ${at + 1}`, () =>
                        runGemini(item, candidates[at]),
                    ),
                );
                process.stdout.write(`\rgemini ${at + 1}/${cases.length}`);
            }
            process.stdout.write("\n");
        } else if (engine === "jev") {
            // One call per email, all of them at once: the whole point of a
            // call this short is that nothing has to wait for the one before.
            verdicts = await Promise.all(
                cases.map((item, at) =>
                    attempt(`jev case ${at + 1}`, () =>
                        runJev(item, candidates[at]),
                    ),
                ),
            );
        } else if (engine === "jev-batch") {
            const groups: (Verdict | null)[][] = [];
            for (let at = 0; at < cases.length; at += JEV_GROUP_SIZE) {
                const group = cases.slice(at, at + JEV_GROUP_SIZE);
                const answered = await attempt(`jev-batch group at ${at}`, () =>
                    runJevBatch(
                        group,
                        candidates.slice(at, at + JEV_GROUP_SIZE),
                    ),
                );
                // A group that never came back loses every email in it, which
                // is the cost of asking about them together.
                groups.push(answered ?? group.map(() => null));
            }
            verdicts = groups.flat();
        } else {
            throw new Error(
                `Unknown engine "${engine}". Use gemini, jev, jev-batch or all.`,
            );
        }

        reports.push(score(engine, cases, verdicts, performance.now() - start));
        if (detail) {
            printDetail(
                engine,
                cases,
                verdicts.map((verdict) =>
                    verdict ? settle(verdict, MOVED_THRESHOLD) : null,
                ),
            );
            printSweep(cases, verdicts);
        }
    }

    print(reports, cases.length);
    await getPool().end();
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
