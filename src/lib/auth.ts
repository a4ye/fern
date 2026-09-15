import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { cache } from "react";
import { headers } from "next/headers";
import { getPool } from "@/db/client";
import { getUserById } from "@/db/admin";
import { isAdmin } from "@/lib/admin";
import { isEmailSyncApproved } from "@/lib/email/access";
import { viewAsTarget } from "@/lib/view-as";

const requiredEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `${name} environment variable is not set. ` +
                "Copy .env.example to .env and fill it in.",
        );
    }
    return value;
};

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleGenerativeAiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const googleGenerativeAiPaidService =
    process.env.GOOGLE_GENERATIVE_AI_PAID_SERVICE === "true";

// Email sync links a Google account for Gmail access. It is optional: without
// every privacy-safe processing setting, the rest of the app runs unchanged
// and the feature remains unavailable.
export const emailSyncEnabled = Boolean(
    googleClientId &&
    googleClientSecret &&
    googleGenerativeAiApiKey &&
    googleGenerativeAiPaidService,
);

// GitHub is how everyone signs in. Google is only ever linked afterwards, for
// read access to a connected inbox, and is never a way into the account.
export const GITHUB_PROVIDER_ID = "github";
export const GOOGLE_PROVIDER_ID = "google";
export const GMAIL_READONLY_SCOPE =
    "https://www.googleapis.com/auth/gmail.readonly";

export const auth = betterAuth({
    database: getPool(),
    session: {
        // Most authenticated routes only need the same session identity that
        // was read moments ago. A short encrypted cookie cache removes that
        // repeated database round trip while bounding revocation staleness.
        cookieCache: { enabled: true, maxAge: 60, strategy: "jwe" },
    },
    account: {
        // OAuth grants include access to the user's GitHub identity and,
        // optionally, Gmail. Encrypt every provider token before it reaches the
        // database. Existing plaintext tokens remain readable and are replaced
        // with encrypted values when their provider refreshes them.
        encryptOAuthTokens: true,
        accountLinking: {
            enabled: true,
            trustedProviders: [GOOGLE_PROVIDER_ID],
        },
    },
    socialProviders: {
        github: {
            clientId: requiredEnv("GITHUB_CLIENT_ID"),
            clientSecret: requiredEnv("GITHUB_CLIENT_SECRET"),
        },
        ...(emailSyncEnabled
            ? {
                  google: {
                      clientId: googleClientId as string,
                      clientSecret: googleClientSecret as string,
                      // Offline access plus a forced consent screen are what
                      // make Google return a refresh token, so background syncs
                      // keep working after the first access token expires.
                      accessType: "offline",
                      prompt: "select_account consent",
                  },
              }
            : {}),
    },
    hooks: {
        before: createAuthMiddleware(async (context) => {
            const isGoogleCallback =
                context.path === `/callback/${GOOGLE_PROVIDER_ID}`;
            if (
                context.body?.provider !== GOOGLE_PROVIDER_ID &&
                !isGoogleCallback
            ) {
                return;
            }

            // Google is only for linking Gmail to an existing GitHub account,
            // never for signing in to Fern directly.
            if (context.path === "/sign-in/social") {
                throw APIError.from("FORBIDDEN", {
                    code: "GOOGLE_SIGN_IN_DISABLED",
                    message: "Google sign-in is not available.",
                });
            }
            if (context.path !== "/link-social" && !isGoogleCallback) return;

            const session = await getSessionFromCtx(context);
            if (!session || !isEmailSyncApproved(session.user.email)) {
                throw APIError.from("FORBIDDEN", {
                    code: "EMAIL_SYNC_NOT_APPROVED",
                    message: "Inbox sync is not available for this account.",
                });
            }
        }),
    },
    // Sign-in and the OAuth callbacks are the only endpoints anyone can reach
    // without a session, so they are the only ones an anonymous caller can
    // hammer. better-auth counts per IP; it is off outside production and
    // counts in memory by default, which on serverless means per instance and
    // so barely at all. Both are turned on here rather than left to the
    // defaults, and the count is kept in the database every instance shares.
    // These count per IP address, which means they are shared by everyone
    // behind one: a campus, an office, a phone network. The numbers are set for
    // a building full of people rather than for one, since the alternative is
    // that the first thirty students to open the app in a lecture hall lock out
    // the rest. What they are here to stop is a script, and a script goes
    // orders of magnitude past these rather than a little.
    rateLimit: {
        enabled: true,
        storage: "database",
        modelName: "rate_limit",
        window: 60,
        max: 600,
        customRules: {
            // Starting a sign-in redirects to a provider, and a callback ends
            // in a session write. A person does this once; a script would do it
            // to make the app open connections on its behalf.
            "/sign-in/social": { window: 60, max: 60 },
            "/callback/*": { window: 60, max: 60 },
        },
    },
    plugins: [nextCookies()],
});

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

// Who the request is for, and who is really making it. The two differ only
// while an admin is viewing another account, and the identity every page and
// action works from is the first of them, so a view-as is invisible to
// everything downstream of here and cannot be half applied.
//
// Layouts, pages, and metadata are rendered as separate Server Components. Keep
// their authentication check to one database read for the lifetime of a request.
const resolveRequest = cache(
    async (): Promise<{
        session: Session | null;
        viewedBy: Session | null;
    }> => {
        const real = await auth.api.getSession({ headers: await headers() });
        if (!real) return { session: null, viewedBy: null };

        // The cookie is checked against the allowlist on every request rather
        // than when the viewing started, so removing an address from
        // ADMIN_EMAILS ends any viewing it was doing on the next page load.
        const targetId = await viewAsTarget(real.user.id);
        if (
            !targetId ||
            targetId === real.user.id ||
            !isAdmin(real.user.email)
        ) {
            return { session: real, viewedBy: null };
        }

        const target = await getUserById(targetId);
        if (!target) return { session: real, viewedBy: null };

        return {
            session: { ...real, user: { ...real.user, ...target } },
            viewedBy: real,
        };
    },
);

export const getRequestSession = async (): Promise<Session | null> =>
    (await resolveRequest()).session;

// The account the browser actually signed in to. Anything that answers for the
// person at the keyboard rather than for the data on screen asks for this:
// starting or ending a view-as, and the provider accounts better-auth holds.
export const getRealSession = async (): Promise<Session | null> => {
    const { session, viewedBy } = await resolveRequest();
    return viewedBy ?? session;
};

export const isAdminRequest = async (): Promise<boolean> =>
    isAdmin((await getRealSession())?.user.email);

// The admin and the account they are looking at, or null when the request is
// somebody working on their own data. Writes refuse while this is set, and the
// dashboard says so, so neither account is changed by a look at one of them.
export const getViewAs = async (): Promise<{
    admin: Session["user"];
    user: Session["user"];
} | null> => {
    const { session, viewedBy } = await resolveRequest();
    if (!session || !viewedBy) return null;
    return { admin: viewedBy.user, user: session.user };
};
