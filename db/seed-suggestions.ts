// Fills the inbox sync panel with pending suggestions so the trigger badge, the
// popover rows, and accept/dismiss can be exercised without a real Gmail sync.
//
//   bun run db:seed-suggestions              # 3 suggestions for the Google-linked user
//   bun run db:seed-suggestions 8            # a different count
//   bun run db:seed-suggestions 8 you@example.com
//   bun run db:seed-suggestions --list="My list"  # only that list's applications
//   bun run db:seed-suggestions --clear      # remove every seeded suggestion
//
// Seeded rows carry a "seed-" message id, which is what --clear matches on, so
// suggestions from a real sync are never touched.

import { getPool } from "../src/db/client";
import { applicationsForUser } from "../src/db/queries";
import {
    insertEmailSuggestions,
    type EmailSuggestionInput,
    type UserApplication,
} from "../src/db/email";
import { isEmailSyncApproved } from "../src/lib/email/access";
import type { ApplicationStatus } from "../src/components/dashboard/data";

const SEED_PREFIX = "seed-";

// Terminal statuses are left out: an email that moves an application backwards
// out of "rejected" is not a suggestion the panel would ever make.
const NEXT_STATUSES: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
    not_applied: ["applied"],
    applied: ["online_assessment", "takehome", "interviewing", "rejected"],
    online_assessment: ["interviewing", "rejected"],
    takehome: ["interviewing", "rejected"],
    interviewing: ["onsite", "offer_in_progress", "rejected"],
    onsite: ["offer_in_progress", "rejected"],
    offer_in_progress: ["offer_accepted", "offer_declined"],
};

type Template = {
    subject: (company: string, role: string) => string;
    snippet: (company: string, role: string) => string;
};

const TEMPLATES: Record<ApplicationStatus, Template> = {
    not_applied: {
        subject: (company) => `Finish your application to ${company}`,
        snippet: (company) =>
            `You started an application at ${company} but have not submitted it yet.`,
    },
    applied: {
        subject: (company, role) =>
            `We received your application for ${role} at ${company}`,
        snippet: (company) =>
            `Thanks for applying. Our team is reviewing your application and will be in touch once a decision is made about next steps at ${company}.`,
    },
    online_assessment: {
        subject: (_, role) => `Next step: online assessment for ${role}`,
        snippet: (company) =>
            `Please complete a 60 minute coding assessment within the next five days to continue with ${company}.`,
    },
    takehome: {
        subject: (_, role) => `Take-home exercise for ${role}`,
        snippet: () =>
            `Attached is a short take-home exercise. Plan for about three hours and send it back within a week.`,
    },
    interviewing: {
        subject: (company, role) =>
            `Interview invitation: ${role} at ${company}`,
        snippet: () =>
            `We would like to set up a 45 minute call with the hiring manager. Please pick a time that works for you.`,
    },
    onsite: {
        subject: (company) => `Onsite interview at ${company}`,
        snippet: (company) =>
            `We would like to bring you into the ${company} office for a final round of four interviews. Travel is covered.`,
    },
    offer_in_progress: {
        subject: (company) => `Your offer from ${company}`,
        snippet: (company) =>
            `We are delighted to extend you an offer to join ${company}. The written details are attached for your review.`,
    },
    offer_accepted: {
        subject: (company) => `Welcome to ${company}`,
        snippet: () =>
            `Thanks for signing. Your start date is confirmed and onboarding details will follow next week.`,
    },
    offer_declined: {
        subject: (_, role) => `Re: ${role} offer`,
        snippet: () =>
            `Thanks for letting us know. We understand your decision and would welcome an application from you in future.`,
    },
    offer_rescinded: {
        subject: (company) => `Update on your offer from ${company}`,
        snippet: () =>
            `Because of a change in headcount planning we are no longer able to move forward with this offer.`,
    },
    rejected: {
        subject: (_, role) => `Update on your application for ${role}`,
        snippet: (company) =>
            `After careful consideration we have decided to move forward with other candidates for this role at ${company}.`,
    },
    ghosted: {
        subject: (company) => `Re: your application to ${company}`,
        snippet: () =>
            `This role has been closed and is no longer being filled.`,
    },
    other: {
        subject: (company) => `A note about your application to ${company}`,
        snippet: () =>
            `There is an update on your application. Please see the details below.`,
    },
};

const senderDomain = (company: string): string =>
    `${company.toLowerCase().replace(/[^a-z0-9]+/g, "") || "employer"}.com`;

const pick = <T>(values: T[]): T =>
    values[Math.floor(Math.random() * values.length)];

const shuffle = <T>(values: T[]): T[] => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const buildSuggestion = (
    application: UserApplication,
    index: number,
): EmailSuggestionInput | null => {
    const candidates = NEXT_STATUSES[application.status];
    if (!candidates) return null;

    const suggestedStatus = pick(candidates);
    const role = application.role ?? "the role";
    const template = TEMPLATES[suggestedStatus];

    return {
        applicationId: application.id,
        messageId: `${SEED_PREFIX}${crypto.randomUUID()}`,
        from: `careers@${senderDomain(application.company)}`,
        subject: template.subject(application.company, role),
        snippet: template.snippet(application.company, role),
        // Days back rather than hours, so accepting one visibly dates the step
        // by the mail instead of by the click.
        receivedAt: new Date(Date.now() - (index + 1) * 86_400_000),
        currentStatus: application.status,
        suggestedStatus,
        confidence: 0.7 + Math.random() * 0.25,
        reasoning: `Seeded suggestion for UI testing.`,
    };
};

type SeedUser = { id: string; email: string; hasGoogle: boolean };

const findUser = async (email: string | undefined): Promise<SeedUser> => {
    const pool = getPool();
    const { rows } = await pool.query<SeedUser>(
        `select u.id,
                u.email,
                exists (
                    select 1 from account a
                     where a."userId" = u.id and a."providerId" = 'google'
                ) as "hasGoogle"
           from "user" u
          where ($1::text is null or lower(u.email) = lower($1))
          order by exists (
                    select 1 from account a
                     where a."userId" = u.id and a."providerId" = 'google'
                 ) desc,
                 u."createdAt"
          limit 1`,
        [email ?? null],
    );

    const user = rows[0];
    if (!user) throw new Error(email ? `No user ${email}` : "No users found");
    return user;
};

const findApplications = async (
    userId: string,
    listName: string | undefined,
): Promise<UserApplication[]> => {
    const rows = await applicationsForUser(getPool(), { userId });
    const matching = listName
        ? rows.filter(
              (row) => row.listName.toLowerCase() === listName.toLowerCase(),
          )
        : rows;
    if (listName && matching.length === 0) {
        const names = [...new Set(rows.map((row) => row.listName))];
        throw new Error(
            `No applications in a list named "${listName}". Lists: ${names.join(", ")}`,
        );
    }
    return matching.map((row) => ({
        id: row.id,
        company: row.companyName,
        role: row.roleTitle,
        status: row.status as ApplicationStatus,
    }));
};

const clearSeeded = async (userId: string): Promise<number> => {
    const { rowCount } = await getPool().query(
        `delete from email_suggestions
          where user_id = $1 and message_id like $2`,
        [userId, `${SEED_PREFIX}%`],
    );
    return rowCount ?? 0;
};

const run = async (): Promise<void> => {
    const args = process.argv.slice(2);
    const clear = args.includes("--clear");
    const rest = args.filter((arg) => !arg.startsWith("--"));
    const count = Number(rest.find((arg) => /^\d+$/.test(arg)) ?? 3);
    const email = rest.find((arg) => arg.includes("@"));
    const listName = args
        .find((arg) => arg.startsWith("--list="))
        ?.slice("--list=".length);

    const user = await findUser(email);

    if (clear) {
        const removed = await clearSeeded(user.id);
        console.log(`Removed ${removed} seeded suggestions for ${user.email}.`);
        return;
    }

    const applications = await findApplications(user.id, listName);
    const suggestions = shuffle(applications)
        .map(buildSuggestion)
        .filter((suggestion): suggestion is EmailSuggestionInput =>
            Boolean(suggestion),
        )
        .slice(0, count);

    if (suggestions.length === 0) {
        throw new Error(
            `No applications for ${user.email} are in a status that can move forward.`,
        );
    }

    const inserted = await insertEmailSuggestions(user.id, suggestions);
    console.log(`Inserted ${inserted} pending suggestions for ${user.email}.`);
    console.table(
        suggestions.map((suggestion) => ({
            from: suggestion.currentStatus,
            to: suggestion.suggestedStatus,
            subject: suggestion.subject,
        })),
    );

    if (!user.hasGoogle) {
        console.warn(
            `Warning: ${user.email} has no linked Google account, so the panel stays on the "Connect Gmail" screen and these will not show.`,
        );
    }
    if (!isEmailSyncApproved(user.email)) {
        console.warn(
            `Warning: ${user.email} is not in EMAIL_SYNC_APPROVED_EMAILS, so the panel is hidden entirely.`,
        );
    }
};

await run();
process.exit(0);
