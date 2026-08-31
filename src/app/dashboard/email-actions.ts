"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth, emailSyncEnabled, GOOGLE_PROVIDER_ID } from "@/lib/auth";
import { applySuggestion, dismissSuggestion } from "@/db/email";
import { createGmailProvider } from "@/lib/email/gmail";
import { syncEmailInbox } from "@/lib/email/sync";
import { EMAIL_SYNC_COPY } from "@/lib/email/copy";
import { EmailAuthError } from "@/lib/email/types";
import { recordMetrics } from "@/db/metrics";
import { withinBudget } from "@/db/rate-limit";
import { INBOX_SCAN, INBOX_SUGGESTION, record } from "@/lib/metrics";
import { TOO_MANY_REQUESTS } from "@/lib/limits";
import { timeZoneSchema } from "@/lib/validation";
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
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) {
        return {
            ok: false,
            reason: "unauthenticated",
            message: EMAIL_SYNC_COPY.signIn,
        };
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

export const acceptSuggestion = async (
    suggestionId: string,
    timeZone: string,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;
    if (!isEmailSyncApproved(session.user.email)) return;
    if (!(await withinBudget(session.user.id, "write"))) return;

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) return;

    await applySuggestion(session.user.id, suggestionId, parsedTimeZone.data);
    after(() => recordMetrics([record(INBOX_SUGGESTION, "accepted")]));
    revalidatePath("/dashboard", "layout");
};

export const dismissSuggestionAction = async (
    suggestionId: string,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;
    if (!isEmailSyncApproved(session.user.email)) return;
    if (!(await withinBudget(session.user.id, "write"))) return;

    await dismissSuggestion(session.user.id, suggestionId);
    after(() => recordMetrics([record(INBOX_SUGGESTION, "dismissed")]));
    revalidatePath("/dashboard");
};
