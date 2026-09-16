"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
    auth,
    emailSyncEnabled,
    getRequestSession,
    getViewAs,
    GOOGLE_PROVIDER_ID,
} from "@/lib/auth";
import { VIEW_ONLY } from "@/lib/view-as";
import { applySuggestion, dismissSuggestion } from "@/db/email";
import { createGmailProvider } from "@/lib/email/gmail";
import { EMAIL_SYNC_COPY } from "@/lib/email/copy";
import { EmailAuthError } from "@/lib/email/types";
import { recordMetrics } from "@/db/metrics";
import { withinBudget } from "@/db/rate-limit";
import { INBOX_SCAN, INBOX_SUGGESTION, record } from "@/lib/metrics";
import { TOO_MANY_REQUESTS } from "@/lib/limits";
import { timeZoneSchema, type ActionResult } from "@/lib/validation";
import { isEmailSyncApproved } from "@/lib/email/access";

export type SyncResult =
    | {
          ok: true;
          found: number;
          scanned: number;
          remaining: number;
          hasMore: boolean;
          initialScanLimited: boolean;
      }
    | {
          ok: false;
          reason:
              | "unauthenticated"
              | "not_approved"
              | "not_connected"
              | "auth_expired"
              | "ai_unconfigured"
              | "error";
          message: string;
      };

export const syncInbox = async (): Promise<SyncResult> => {
    const requestHeaders = await headers();
    const session = await getRequestSession();
    if (!session) {
        return {
            ok: false,
            reason: "unauthenticated",
            message: EMAIL_SYNC_COPY.signIn,
        };
    }

    // A sync reads the inbox of whoever is really signed in, so running one
    // while looking at somebody else would file an admin's mail under their
    // account.
    if (await getViewAs()) {
        return { ok: false, reason: "error", message: VIEW_ONLY };
    }

    if (!isEmailSyncApproved(session.user.email)) {
        return {
            ok: false,
            reason: "not_approved",
            message: EMAIL_SYNC_COPY.notApproved,
        };
    }

    if (!emailSyncEnabled) {
        return {
            ok: false,
            reason: "ai_unconfigured",
            message: EMAIL_SYNC_COPY.unconfigured,
        };
    }

    // Taken before Google is asked for anything. A sync reads an inbox and then
    // pays a model to read it, which is the only work here that costs money per
    // call, so it is budgeted ahead of the token rather than after it.
    if (!(await withinBudget(session.user.id, "inbox"))) {
        return { ok: false, reason: "error", message: TOO_MANY_REQUESTS };
    }

    let accessToken: string;
    try {
        const token = await auth.api.getAccessToken({
            body: { providerId: GOOGLE_PROVIDER_ID },
            headers: requestHeaders,
        });
        if (!token.accessToken) throw new EmailAuthError();
        accessToken = token.accessToken;
    } catch {
        return {
            ok: false,
            reason: "not_connected",
            message: EMAIL_SYNC_COPY.connectGoogle,
        };
    }

    const userId = session.user.id;

    try {
        const provider = createGmailProvider(accessToken);
        const { syncEmailInbox } = await import("@/lib/email/sync");
        const outcome = await syncEmailInbox(userId, provider);
        // What the model was given and what it proposed, which together are the
        // only measure of whether it is worth paying for. What becomes of each
        // proposal is counted where the user answers it.
        after(() =>
            recordMetrics([
                record(INBOX_SCAN, "read", { total: outcome.scanned }),
                record(INBOX_SUGGESTION, "offered", {
                    count: outcome.found,
                }),
            ]),
        );
        revalidatePath("/dashboard", "layout");
        return { ok: true, ...outcome };
    } catch (error) {
        if (error instanceof EmailAuthError) {
            return {
                ok: false,
                reason: "auth_expired",
                message: EMAIL_SYNC_COPY.accessExpired,
            };
        }
        return {
            ok: false,
            reason: "error",
            message:
                error instanceof Error
                    ? error.message
                    : EMAIL_SYNC_COPY.genericFailure,
        };
    }
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

    await dismissSuggestion(writer.userId, suggestionId);
    after(() => recordMetrics([record(INBOX_SUGGESTION, "dismissed")]));
    revalidatePath("/dashboard");
    return { ok: true };
};
