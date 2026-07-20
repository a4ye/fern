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

export const auth = betterAuth({
    database: getPool(),
    socialProviders: {
        github: {
            clientId: requiredEnv("GITHUB_CLIENT_ID"),
            clientSecret: requiredEnv("GITHUB_CLIENT_SECRET"),
        },
    },
    plugins: [nextCookies()],
});
