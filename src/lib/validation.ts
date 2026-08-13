import { z } from "zod";
import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    PAY_PERIODS,
    toDateInput,
    type ListStatus,
} from "@/components/dashboard/data";

// Result shape returned by mutating server actions so callers can distinguish a
// successful write from a rejected one and show the reason, rather than the
// action silently returning on invalid input.
export type ActionResult = { ok: true } | { ok: false; error: string };

export const LIST_NAME_MAX = 80;
export const LIST_DESCRIPTION_MAX = 280;

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

export const COMPANY_MAX = 120;
export const ROLE_MAX = 160;
export const LOCATION_MAX = 120;
export const PAY_MAX = 80;
export const URL_MAX = 2048;

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
export const APPLIED_MIN_YEAR = 1990;
export const APPLIED_MIN = `${APPLIED_MIN_YEAR}-01-01`;

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

export const NOTES_MAX = 4000;

// What an amount field accepts before it stops taking keys: ten digits and two
// decimals, plus room for the grouping commas people type, which the schema
// strips back out.
export const AMOUNT_INPUT_MAX = 16;

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

// The detail panel writes every column an application has, which is more than
// the table's own row exposes. Status is missing on purpose: it moves by
// recording a step, never by saving the form.
export const applicationDetailSchema = z
    .object({
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
        arrangement: z
            .enum(ARRANGEMENTS, "Choose a valid arrangement.")
            .nullable(),
        appliedAt: appliedAtSchema,
        url: urlSchema,
        payMin: amountSchema("Minimum pay"),
        payMax: amountSchema("Maximum pay"),
        // The column is char(3), and the picker's list comes from the runtime's
        // own currency data, which need not match byte for byte between the
        // browser that offered the code and the server that stores it. The
        // shape is what matters.
        payCurrency: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z]{3}$/, "Choose a valid currency."),
        payPeriod: z.enum(PAY_PERIODS, "Choose a valid pay period.").nullable(),
        bonus: amountSchema("Bonus"),
        payNote: optionalText("Pay note", PAY_MAX),
        notes: optionalText("Notes", NOTES_MAX),
    })
    // The column has the same check, so catching it here is the difference
    // between a message and a failed write.
    .refine(
        (pay) =>
            pay.payMin === null ||
            pay.payMax === null ||
            Number(pay.payMax) >= Number(pay.payMin),
        "Maximum pay cannot be less than the minimum.",
    );

// The detail panel stages its history edits and sends them with the form, so
// the steps it drops and the ones it records arrive as part of the same save.
export const stepEditsSchema = z.object({
    removed: z.array(z.string()),
    added: z.array(z.enum(APPLICATION_STATUSES, "Choose a valid status.")),
});

// Narrows a safeParse failure to a single message for display. Schemas above
// validate one field at a time in practice, so the first issue is the relevant
// one.
export const firstIssue = (error: z.ZodError): string =>
    error.issues[0]?.message ?? "That input is not valid.";
