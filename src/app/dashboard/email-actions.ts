"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth, GOOGLE_PROVIDER_ID } from "@/lib/auth";
import {
    applySuggestion,
    dismissSuggestion,
    getApplicationsForUser,
    insertEmailSuggestion,
    recordEmailSync,
} from "@/db/email";
import { classifyEmails } from "@/lib/email/classify";
import { createGmailProvider } from "@/lib/email/gmail";
import { EmailAuthError } from "@/lib/email/types";

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

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return {
            ok: false,
            reason: "ai_unconfigured",
            message:
                "AI is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY to enable email classification.",
        };
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

        let found = 0;
        for (const match of matches) {
            const email = emails[match.emailIndex];
            const application = applications[match.applicationIndex];
            // Skip matches that only restate the current status.
            if (application.status === match.suggestedStatus) continue;

            const inserted = await insertEmailSuggestion({
                userId,
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
            });
            if (inserted) found += 1;
        }

        await recordEmailSync(userId);
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

export const acceptSuggestion = async (suggestionId: string): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    await applySuggestion(session.user.id, suggestionId);
    revalidatePath("/dashboard", "layout");
};

export const dismissSuggestionAction = async (
    suggestionId: string,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    await dismissSuggestion(session.user.id, suggestionId);
    revalidatePath("/dashboard");
};
