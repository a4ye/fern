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

// Email sync links a Google account for Gmail access. It is optional: without
// Google credentials the rest of the app runs unchanged and the feature stays
// hidden.
export const emailSyncEnabled = Boolean(googleClientId && googleClientSecret);

export const GOOGLE_PROVIDER_ID = "google";
export const GMAIL_READONLY_SCOPE =
    "https://www.googleapis.com/auth/gmail.readonly";

export const auth = betterAuth({
    database: getPool(),
    account: {
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
