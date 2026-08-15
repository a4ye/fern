import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPool } from "@/db/client";

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

export const GOOGLE_PROVIDER_ID = "google";
export const GMAIL_READONLY_SCOPE =
    "https://www.googleapis.com/auth/gmail.readonly";

export const auth = betterAuth({
    database: getPool(),
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
    plugins: [nextCookies()],
});
