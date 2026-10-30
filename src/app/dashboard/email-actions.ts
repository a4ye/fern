"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getRequestSession, getViewAs } from "@/lib/auth";
import { VIEW_ONLY } from "@/lib/view-as";
import { applySuggestion, dismissSuggestion } from "@/db/email";
import { EMAIL_SYNC_COPY } from "@/lib/email/copy";
import { recordMetrics } from "@/db/metrics";
import { withinBudget } from "@/db/rate-limit";
import { INBOX_SUGGESTION, record } from "@/lib/metrics";
import { TOO_MANY_REQUESTS } from "@/lib/limits";
import {
    applicationIdSchema,
    timeZoneSchema,
    type ActionResult,
} from "@/lib/validation";
import { isEmailSyncApproved } from "@/lib/email/access";

export type { SyncResult } from "@/lib/email/sync-result";

export const syncInbox = async () => {
    const { runInboxSync } = await import("@/lib/email/run-sync");
    return runInboxSync();
};

// Answering a suggestion resolves it for the one account that owns it, and
// costs that account a write. The browser drops the row before it asks, so a
// refusal has to travel back with a reason: it is what the popover shows in
// place of the confirmation it has already put up.
type Resolver = { ok: true; userId: string } | { ok: false; error: string };

const resolvingUser = async (): Promise<Resolver> => {
    const session = await getRequestSession();
    if (!session) {
        return { ok: false, error: EMAIL_SYNC_COPY.signInToResolve };
    }
    if (await getViewAs()) return { ok: false, error: VIEW_ONLY };
    if (!isEmailSyncApproved(session.user.email)) {
        return { ok: false, error: EMAIL_SYNC_COPY.notApproved };
    }
    if (!(await withinBudget(session.user.id, "write"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }
    return { ok: true, userId: session.user.id };
};

export const acceptSuggestion = async (
    suggestionId: string,
    timeZone: string,
): Promise<ActionResult> => {
    const writer = await resolvingUser();
    if (!writer.ok) return writer;
    // The suggestion id reaches a uuid column, where a value of another shape
    // raises rather than matching nothing.
    if (!applicationIdSchema.safeParse(suggestionId).success) {
        return { ok: false, error: EMAIL_SYNC_COPY.suggestionGone };
    }

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: EMAIL_SYNC_COPY.resolveFailed };
    }

    const applied = await applySuggestion(
        writer.userId,
        suggestionId,
        parsedTimeZone.data,
    );
    // A suggestion that was already answered moved nothing, so counting it
    // would read as a second acceptance of the same mail. Either way the
    // browser is holding a list that no longer matches, so it is refreshed.
    if (applied) {
        after(() => recordMetrics([record(INBOX_SUGGESTION, "accepted")]));
    }
    revalidatePath("/dashboard", "layout");
    return applied
        ? { ok: true }
        : { ok: false, error: EMAIL_SYNC_COPY.suggestionGone };
};

export const dismissSuggestionAction = async (
    suggestionId: string,
): Promise<ActionResult> => {
    const writer = await resolvingUser();
    if (!writer.ok) return writer;
    if (!applicationIdSchema.safeParse(suggestionId).success) {
        return { ok: false, error: EMAIL_SYNC_COPY.suggestionGone };
    }

    await dismissSuggestion(writer.userId, suggestionId);
    after(() => recordMetrics([record(INBOX_SUGGESTION, "dismissed")]));
    revalidatePath("/dashboard");
    return { ok: true };
};
