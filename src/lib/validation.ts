import { z } from "zod";
import { MAX_STATUS_STEP_EDITS } from "@/lib/limits";
import {
    POSTING_FIELD_COUNT,
    POSTING_OUTCOMES,
    POSTING_READERS,
    POSTING_READ_MS_MAX,
    isPostingReader,
} from "@/lib/metrics";
import { POSTING_SOURCES } from "@/lib/job-import/shared";
import { LINK_DURATION_VALUES } from "@/lib/share";
import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    PAY_PERIODS,
    toDateInput,
    type ListStatus,
} from "@/components/dashboard/data";
import {
    APPLIED_MIN,
    APPLIED_MIN_YEAR,
    COMPANY_MAX,
    DISPLAY_NAME_MAX,
    LIST_DESCRIPTION_MAX,
    LIST_NAME_MAX,
    LOCATION_MAX,
    NOTES_MAX,
    PAY_MAX,
    ROLE_MAX,
    URL_MAX,
} from "@/lib/constraints";

export {
    AMOUNT_INPUT_MAX,
    APPLIED_MIN,
    APPLIED_MIN_YEAR,
    COMPANY_MAX,
    DISPLAY_NAME_MAX,
    LIST_DESCRIPTION_MAX,
    LIST_NAME_MAX,
    LOCATION_MAX,
    NOTES_MAX,
    PAY_MAX,
    ROLE_MAX,
    URL_MAX,
} from "@/lib/constraints";

// Result shape returned by mutating server actions so callers can distinguish a
// successful write from a rejected one and show the reason, rather than the
// action silently returning on invalid input.
export type ActionResult = { ok: true } | { ok: false; error: string };

export const applicationIdSchema = z
    .string()
    .uuid("Choose a valid application.");

// The satisfies clause ties these values to ListStatus in
// src/components/dashboard/data.ts, so a typo or renamed status fails to compile.
export const listStatusSchema = z.enum(
    ["active", "closed", "archived"] satisfies readonly ListStatus[],
    "Choose a valid status.",
);

const nameSchema = z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(LIST_NAME_MAX, `Name must be ${LIST_NAME_MAX} characters or fewer.`);

// Optional free text: blank collapses to null, and the length cap runs against
// the trimmed value.
const optionalText = (label: string, max: number) =>
    z
        .string()
        .nullish()
        .transform((value) => value?.trim() ?? "")
        .refine((value) => value.length <= max, {
            message: `${label} must be ${max} characters or fewer.`,
        })
        .transform((value) => (value.length > 0 ? value : null));

export const listCreateSchema = z.object({
    name: nameSchema,
    description: optionalText("Description", LIST_DESCRIPTION_MAX),
});

export const listUpdateSchema = listCreateSchema.extend({
    status: listStatusSchema,
});

// Server actions receive this from the browser. Validate it at the action
// boundary before PostgreSQL uses it in `current_timestamp at time zone ...`.
export const timeZoneSchema = z
    .string()
    .trim()
    .min(1, "Time zone is required.")
    .max(100, "Time zone is too long.")
    .refine((timeZone) => {
        try {
            new Intl.DateTimeFormat("en", { timeZone }).format();
            return true;
        } catch {
            return false;
        }
    }, "Choose a valid time zone.");

// Links are rendered as hrefs, so anything but http(s) is rejected rather than
// stored: a `javascript:` address would run on click.
const isHttpUrl = (value: string): boolean => {
    try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
};

export const urlSchema = optionalText("Link", URL_MAX).refine(
    (value) => value === null || isHttpUrl(value),
    "Link must be a http:// or https:// address.",
);

// A date column takes real days only, so a shape check on its own would leave
// 2026-02-31 to fail on the write. Reading the parts back proves the day exists,
// since Date rolls an overflowing one into the month after.
const isRealDay = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
};

// An applied date records something that already happened, so the future is out.
// The floor is what keeps a calendar paged far enough back, or an import that
// misread a year, from landing in one nobody was applying in.
// yyyy-mm-dd compares as text the way it does as a date. The ceiling is tomorrow
// rather than today because the day is picked against the browser's clock, which
// can be a day ahead of the server's.
const latestApplied = (): string => {
    const now = new Date();
    return toDateInput(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    );
};

const appliedAtSchema = optionalText("Applied date", 10)
    .refine(
        (value) => value === null || isRealDay(value),
        "Applied date must be a real date.",
    )
    .refine(
        (value) =>
            value === null ||
            (value >= APPLIED_MIN && value <= latestApplied()),
        `Applied date must fall between ${APPLIED_MIN_YEAR} and today.`,
    );

export const applicationSchema = z.object({
    company: z
        .string()
        .trim()
        .min(1, "Company is required.")
        .max(
            COMPANY_MAX,
            `Company must be ${COMPANY_MAX} characters or fewer.`,
        ),
    role: optionalText("Role", ROLE_MAX),
    status: z.enum(APPLICATION_STATUSES, "Choose a valid status."),
    location: optionalText("Location", LOCATION_MAX),
    arrangement: z.enum(ARRANGEMENTS, "Choose a valid arrangement.").nullable(),
    pay: optionalText("Pay", PAY_MAX),
    appliedAt: appliedAtSchema,
    url: urlSchema,
});

// One row read out of a spreadsheet: the columns the quick-edit grid holds,
// where pay is still the single line of text the sheet wrote, plus the notes
// only an import carries in alongside them.
export const importRowSchema = applicationSchema.extend({
    notes: optionalText("Notes", NOTES_MAX),
});

// What an amount field accepts before it stops taking keys: ten digits and two
// decimals, plus room for the grouping commas people type, which the schema
// strips back out.
// Amounts land in numeric(12, 2) columns, so they are kept as decimal strings
// end to end rather than rounded through a float, and anything that is not a
// plain number is rejected instead of being silently stored as nothing. Ten
// digits ahead of the point is the column's own ceiling, which AMOUNT_MAX holds
// the free-text pay parser to as well.
const amountSchema = (label: string) =>
    z
        .string()
        .nullish()
        .transform((value) => value?.trim().replace(/,/g, "") ?? "")
        .refine(
            (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
            {
                message: `${label} must be a number, with at most two decimals.`,
            },
        )
        .transform((value) => (value === "" ? null : value));

// The column is char(3), and the picker's list comes from the runtime's own
// currency data, which need not match byte for byte between the browser that
// offered the code and the server that stores it. The shape is what matters.
export const currencySchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Choose a valid currency.");

// Every column an application has, which is more than the table's own row
// exposes. Status is not among them: the detail panel moves it by recording a
// step, and the create form below adds it back as the one it starts at.
const applicationDetailFields = z.object({
    company: z
        .string()
        .trim()
        .min(1, "Company is required.")
        .max(
            COMPANY_MAX,
            `Company must be ${COMPANY_MAX} characters or fewer.`,
        ),
    role: optionalText("Role", ROLE_MAX),
    location: optionalText("Location", LOCATION_MAX),
    arrangement: z.enum(ARRANGEMENTS, "Choose a valid arrangement.").nullable(),
    appliedAt: appliedAtSchema,
    url: urlSchema,
    payMin: amountSchema("Minimum pay"),
    payMax: amountSchema("Maximum pay"),
    // The column is char(3), and the picker's list comes from the runtime's own
    // currency data, which need not match byte for byte between the browser
    // that offered the code and the server that stores it. The shape is what
    // matters.
    payCurrency: currencySchema,
    payPeriod: z.enum(PAY_PERIODS, "Choose a valid pay period.").nullable(),
    bonus: amountSchema("Bonus"),
    payNote: optionalText("Pay note", PAY_MAX),
    notes: optionalText("Notes", NOTES_MAX),
});

// The column has the same check, so catching it here is the difference between
// a message and a failed write.
const payOrdered = (pay: { payMin: string | null; payMax: string | null }) =>
    pay.payMin === null ||
    pay.payMax === null ||
    Number(pay.payMax) >= Number(pay.payMin);

const PAY_ORDER_MESSAGE = "Maximum pay cannot be less than the minimum.";

export const applicationDetailSchema = applicationDetailFields.refine(
    payOrdered,
    PAY_ORDER_MESSAGE,
);

export const applicationCreateSchema = applicationDetailFields
    .extend({ status: z.enum(APPLICATION_STATUSES, "Choose a valid status.") })
    .refine(payOrdered, PAY_ORDER_MESSAGE);

// The detail panel stages its history edits and sends them with the form, so
// the steps it drops and the ones it records arrive as part of the same save.
export const stepEditsSchema = z.object({
    removed: z.array(applicationIdSchema).max(MAX_STATUS_STEP_EDITS),
    added: z
        .array(z.enum(APPLICATION_STATUSES, "Choose a valid status."))
        .max(MAX_STATUS_STEP_EDITS),
});

// The settings page saves its fields together, so one parse covers the form.
export const accountSettingsSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Name is required.")
        .max(
            DISPLAY_NAME_MAX,
            `Name must be ${DISPLAY_NAME_MAX} characters or fewer.`,
        ),
    defaultCurrency: currencySchema,
    cleanLinks: z.boolean(),
    employerLinks: z.boolean(),
    tidyTitles: z.boolean(),
});

// What the browser says a pasted link did. This is the one thing the app records
// on a caller's word, so the word is bounded: every name must be one this app
// already knows, and neither number may exceed what the read it describes could
// physically have reached. A caller cannot invent a bucket, and so cannot make
// this table grow a row per employer.
export const postingReadSchema = z
    .object({
        outcome: z.enum(POSTING_OUTCOMES),
        attempted: z.array(z.enum(POSTING_READERS)),
        source: z.enum(POSTING_SOURCES).nullable(),
        waitedMs: z.number().int().min(0).max(POSTING_READ_MS_MAX),
        fieldsFilled: z.number().int().min(0).max(POSTING_FIELD_COUNT),
    })
    // A reader named twice would be counted twice, which would sink its hit
    // rate without a single extra link having been read.
    .refine(
        (read) => new Set(read.attempted).size === read.attempted.length,
        "A reader cannot be attempted twice in one read.",
    )
    // A reader cannot have filled the form without having been given the link.
    // Left unchecked, hits could outnumber attempts and a reader could report
    // reading more than 100% of what it was shown.
    .refine(
        (read) =>
            !isPostingReader(read.outcome) ||
            read.attempted.includes(read.outcome),
        "The reader that filled the form must be one that was attempted.",
    );

// A friend is added by the name GitHub knows them as, which is the one public
// address every account here already has. GitHub's own rule is the rule: up to
// 39 characters of letters, digits and single hyphens, never leading or
// trailing. Enforced before the lookup so a malformed handle is answered here
// rather than by spending a request on GitHub to be told the same thing.
export const githubUsernameSchema = z
    .string()
    .trim()
    .min(1, "Enter a GitHub username.")
    .max(39, "That is not a GitHub username.")
    .regex(
        /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
        "That is not a GitHub username.",
    );

// Ids of rows this app handed the browser. Friendships, shares and links are all
// uuids, and a caller sending anything else is turned away before the database
// is asked about it.
export const rowIdSchema = z.string().uuid("That is no longer available.");

// Which of the fixed durations a new link was given. An open date field would
// let a caller write a link that outlives the app; the menu is the whole of
// what a link may be set to.
export const linkDurationSchema = z.enum(
    LINK_DURATION_VALUES,
    "Choose how long the link should last.",
);

// Narrows a safeParse failure to a single message for display. Schemas above
// validate one field at a time in practice, so the first issue is the relevant
// one.
export const firstIssue = (error: z.ZodError): string =>
    error.issues[0]?.message ?? "That input is not valid.";
