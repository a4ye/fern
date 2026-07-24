import { z } from "zod";
import type { ListStatus } from "@/components/dashboard/data";

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
const descriptionSchema = z
    .string()
    .nullish()
    .transform((value) => value?.trim() ?? "")
    .refine((value) => value.length <= LIST_DESCRIPTION_MAX, {
        message: `Description must be ${LIST_DESCRIPTION_MAX} characters or fewer.`,
    })
    .transform((value) => (value.length > 0 ? value : null));

export const listCreateSchema = z.object({
    name: nameSchema,
    description: descriptionSchema,
});

export const listUpdateSchema = listCreateSchema.extend({
    status: listStatusSchema,
});

// Narrows a safeParse failure to a single message for display. Schemas above
// validate one field at a time in practice, so the first issue is the relevant
// one.
export const firstIssue = (error: z.ZodError): string =>
    error.issues[0]?.message ?? "That input is not valid.";
