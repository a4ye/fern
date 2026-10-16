import type { ApplicationStatus } from "@/components/dashboard/data";

// Statuses a classifier is allowed to propose. Terminal-by-neglect states like
// "ghosted" or "not_applied" can't be inferred from a single email, so they are
// left off the menu.
//
// Kept apart from either classifier so both offer the same set, and so that
// reading the list does not drag a model SDK in behind it.
export const SUGGESTABLE_STATUSES = [
    "applied",
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
    "offer_in_progress",
    "offer_accepted",
    "offer_declined",
    "offer_rescinded",
    "rejected",
] as const satisfies readonly ApplicationStatus[];
