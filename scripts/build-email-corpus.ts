// Pulls a body-carrying sample of the real inbox into a file, so the classifier
// benchmark can be run against what a sync actually reads rather than against
// the sender, subject and snippet that a stored suggestion kept.
//
// That difference decides cases. A mail reading "we are pleased to invite you
// to the next stage of" says which stage in its next sentence, and the snippet
// stops before it, so no model can answer from the stored row. The body is also
// the only way to count false positives honestly: most of an inbox never
// reaches the model in production, and only a real inbox has that shape.
//
//   bun run corpus:build          # 600 most recent inbox messages
//   bun run corpus:build 1500     # more of them
//
// Reads the signed-in Google account's refresh token out of the database and
// mints an access token with it, the same grant the app holds. The corpus is
// written outside the repository and is not something to commit.

import { writeFileSync } from "node:fs";
import { symmetricDecrypt } from "better-auth/crypto";
import { getPool } from "../src/db/client";
import { createGmailProvider } from "../src/lib/email/gmail";
import type { NormalizedEmail } from "../src/lib/email/types";

const CORPUS_PATH = "/tmp/fern-email-corpus.json";
const DEFAULT_SIZE = 600;
const LOOKBACK_DAYS = 365;

// Gmail charges 5 quota units a message read and allows 250 a second, so fifty
// at a time would sit at the ceiling. The quota is not the binding limit here
// though: reading twenty-five at once draws "Too many concurrent requests for
// user", which counts requests in flight rather than units spent. Ten goes
// through, with a breath between rounds.
const READ_BATCH = 10;
const BETWEEN_ROUNDS_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Gmail refuses a round now and then whatever the pace, and a refused round in
// the middle of a long read would otherwise throw away everything before it.
const withRetry = async <T>(run: () => Promise<T>): Promise<T | null> => {
    for (const wait of [1_000, 4_000, 10_000, null]) {
        try {
            return await run();
        } catch (error) {
            if (wait === null) {
                console.log(
                    `\nskipped a round: ${error instanceof Error ? error.message : error}`,
                );
                return null;
            }
            await sleep(wait);
        }
    }
    return null;
};

type StoredAccount = { refreshToken: string; email: string };

const readAccount = async (): Promise<StoredAccount> => {
    const { rows } = await getPool().query<{
        refreshToken: string | null;
        email: string;
    }>(
        `select a."refreshToken", u.email
         from account a
         join "user" u on u.id = a."userId"
         where a."providerId" = 'google'
           and a."refreshToken" is not null
           and a.scope like '%gmail.readonly%'
         order by a."updatedAt" desc
         limit 1`,
    );
    const row = rows[0];
    if (!row?.refreshToken) {
        throw new Error(
            "No Google account with a refresh token and the Gmail read scope. " +
                "Connect Google in the app first.",
        );
    }

    // auth.ts sets `encryptOAuthTokens`, so what the column holds is ciphertext
    // under the auth secret rather than a token Google would recognise. Handed
    // over raw it comes back as an invalid_grant, which reads like a revoked
    // login and is nothing of the sort.
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");

    return {
        refreshToken: await symmetricDecrypt({
            key: secret,
            data: row.refreshToken,
        }),
        email: row.email,
    };
};

// The stored access token has usually expired by the time anything offline
// wants one, and the refresh token is what the app keeps for exactly this.
const mintAccessToken = async (refreshToken: string): Promise<string> => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error(
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.",
        );
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });
    if (!response.ok) {
        throw new Error(
            `Google refused the refresh (${response.status}): ${await response.text()}`,
        );
    }
    const payload = (await response.json()) as { access_token?: string };
    if (!payload.access_token) throw new Error("No access token came back.");
    return payload.access_token;
};

export type CorpusEmail = NormalizedEmail & {
    // Set where this message is one a suggestion was raised for and answered,
    // which is the only ground truth there is.
    label?: {
        company: string;
        status: string;
        accepted: boolean;
    };
};

const main = async () => {
    const size = Number(process.argv[2] ?? DEFAULT_SIZE);
    if (!Number.isInteger(size) || size < 1) {
        throw new Error(
            `Give a whole number of messages, not "${process.argv[2]}".`,
        );
    }

    const account = await readAccount();
    console.log(`Reading ${account.email}`);
    const provider = createGmailProvider(
        await mintAccessToken(account.refreshToken),
    );

    const discovery = await provider.discoverRecent({
        maxResults: size,
        newerThanDays: LOOKBACK_DAYS,
    });
    console.log(`${discovery.messageIds.length} message ids, reading bodies`);

    const emails: NormalizedEmail[] = [];
    for (let at = 0; at < discovery.messageIds.length; at += READ_BATCH) {
        const batch = discovery.messageIds.slice(at, at + READ_BATCH);
        const read = await withRetry(() => provider.fetchMessages(batch));
        if (read) emails.push(...read);
        process.stdout.write(
            `\r${emails.length}/${discovery.messageIds.length}`,
        );
        await sleep(BETWEEN_ROUNDS_MS);
    }
    process.stdout.write("\n");

    // Whatever has been answered in the app, keyed by the message it came from.
    const { rows } = await getPool().query<{
        message_id: string;
        company_name: string;
        suggested_status: string;
        state: string;
    }>(
        `select s.message_id, a.company_name, s.suggested_status, s.state
         from email_suggestions s
         join applications a on a.id = s.application_id
         where s.state in ('accepted', 'dismissed')
           and s.message_id not like 'seed-%'`,
    );
    const labels = new Map(rows.map((row) => [row.message_id, row]));

    const corpus: CorpusEmail[] = emails.map((email) => {
        const label = labels.get(email.id);
        return label
            ? {
                  ...email,
                  label: {
                      company: label.company_name,
                      status: label.suggested_status,
                      accepted: label.state === "accepted",
                  },
              }
            : email;
    });

    const labelled = corpus.filter((email) => email.label).length;
    writeFileSync(CORPUS_PATH, JSON.stringify(corpus));
    console.log(
        `${corpus.length} emails written to ${CORPUS_PATH}, ` +
            `${labelled} of them carrying a decision already made. ` +
            `${labels.size - labelled} answered suggestions fell outside the ` +
            `window and are not in it.`,
    );
    await getPool().end();
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
