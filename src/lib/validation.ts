import { z } from "zod";
import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
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
    appliedAt: optionalText("Applied date", 10).refine(
        (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
        "Applied date must be a real date.",
    ),
    url: urlSchema,
});

// Narrows a safeParse failure to a single message for display. Schemas above
// validate one field at a time in practice, so the first issue is the relevant
// one.
export const firstIssue = (error: z.ZodError): string =>
    error.issues[0]?.message ?? "That input is not valid.";
