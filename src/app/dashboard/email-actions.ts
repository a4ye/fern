"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth, emailSyncEnabled, GOOGLE_PROVIDER_ID } from "@/lib/auth";
import {
    applySuggestion,
    dismissSuggestion,
    getApplicationsForUser,
    insertEmailSuggestions,
    recordEmailSync,
} from "@/db/email";
import { classifyEmails } from "@/lib/email/classify";
import { createGmailProvider } from "@/lib/email/gmail";
import { EmailAuthError } from "@/lib/email/types";
import { recordMetrics } from "@/db/metrics";
import { withinBudget } from "@/db/rate-limit";
import { INBOX_SCAN, INBOX_SUGGESTION, record } from "@/lib/metrics";
import { TOO_MANY_REQUESTS } from "@/lib/limits";
import { timeZoneSchema } from "@/lib/validation";

const MAX_EMAILS = 25;
const NEWER_THAN_DAYS = 30;

export type SyncResult =
    | { ok: true; found: number; scanned: number }
    | {
          ok: false;
          reason:
              | "unauthenticated"
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
            message: "Sign in to sync your inbox.",
        };
    }

    if (!emailSyncEnabled) {
        return {
            ok: false,
            reason: "ai_unconfigured",
            message:
                "Inbox sync is not configured for privacy-safe processing.",
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
            message: "Connect a Google account to sync your inbox.",
        };
    }

    const userId = session.user.id;

    try {
        const provider = createGmailProvider(accessToken);
        const [emails, applications] = await Promise.all([
            provider.fetchRecent({
                maxResults: MAX_EMAILS,
                newerThanDays: NEWER_THAN_DAYS,
            }),
            getApplicationsForUser(userId),
        ]);

        const matches = await classifyEmails(
            applications.map((app) => ({
                company: app.company,
                role: app.role,
                currentStatus: app.status,
            })),
            emails,
        );

        const suggestions = new Map<string, (typeof matches)[number]>();
        for (const match of matches) {
            const email = emails[match.emailIndex];
            const application = applications[match.applicationIndex];
            // Skip matches that only restate the current status.
            if (application.status === match.suggestedStatus) continue;
            const key = `${application.id}\u0000${email.id}`;
            const previous = suggestions.get(key);
            if (!previous || previous.confidence < match.confidence) {
                suggestions.set(key, match);
            }
            if (suggestions.size >= MAX_EMAILS) break;
        }

        const found = await insertEmailSuggestions(
            userId,
            [...suggestions.values()].map((match) => {
                const email = emails[match.emailIndex];
                const application = applications[match.applicationIndex];
                return {
                    applicationId: application.id,
                    messageId: email.id,
                    from: email.from,
                    subject: email.subject,
                    snippet: email.snippet,
                    receivedAt: email.receivedAt,
                    currentStatus: application.status,
                    suggestedStatus: match.suggestedStatus,
                    confidence: match.confidence,
                    reasoning: match.reasoning,
                };
            }),
        );
        await recordEmailSync(userId);
        // What the model was given and what it proposed, which together are the
        // only measure of whether it is worth paying for. What becomes of each
        // proposal is counted where the user answers it.
        after(() =>
            recordMetrics([
                record(INBOX_SCAN, "read", { total: emails.length }),
                record(INBOX_SUGGESTION, "offered", { count: found }),
            ]),
        );
        revalidatePath("/dashboard", "layout");
        return { ok: true, found, scanned: emails.length };
    } catch (error) {
        if (error instanceof EmailAuthError) {
            return {
                ok: false,
                reason: "auth_expired",
                message: "Google access expired. Reconnect to keep syncing.",
            };
        }
        return {
            ok: false,
            reason: "error",
            message:
                error instanceof Error
                    ? error.message
                    : "Sync failed. Please try again.",
        };
    }
};

export const acceptSuggestion = async (
    suggestionId: string,
    timeZone: string,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;
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
    if (!(await withinBudget(session.user.id, "write"))) return;

    await dismissSuggestion(session.user.id, suggestionId);
    after(() => recordMetrics([record(INBOX_SUGGESTION, "dismissed")]));
    revalidatePath("/dashboard");
};
