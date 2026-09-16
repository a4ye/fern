// A throwaway account with data in it, and the cookie that signs a browser in
// as that account. It exists so deleting an account can be tried end to end
// against something disposable rather than against the one you use.
//
//   bun run db:test-account         # create it fresh and print the cookie
//   bun run db:test-account check   # report what is still stored for it
//
// Paste the printed line into the browser console on the dev server and
// reload: that tab is now the test account. Delete it from Settings, then run
// the check, which is what shows whether anything survived.

import { getPool } from "../src/db/client";

const EMAIL = "test-account@job-tracker.invalid";
const NAME = "Test Account";
const SESSION_DAYS = 7;

// better-auth's cookie, named from its default prefix. It carries the
// __Secure- prefix over https, which is why this script is for localhost.
const COOKIE_NAME = "better-auth.session_token";

const APPLICATIONS = [
    ["Northwind Logistics", "Software Engineer", "applied"],
    ["Acme Robotics", "Backend Engineer", "online_assessment"],
    ["Bluewave Health", "Full Stack Engineer", "interviewing"],
    ["Cobalt Systems", "Platform Engineer", "onsite"],
    ["Driftwood Media", "Frontend Engineer", "offer_in_progress"],
    ["Everline Bank", "Data Engineer", "rejected"],
    ["Foxglove Labs", "Site Reliability Engineer", "ghosted"],
    ["Granite Analytics", "Software Engineer Intern", "not_applied"],
] as const;

type Counts = {
    lists: number;
    applications: number;
    events: number;
    settings: number;
    sessions: number;
    suggestions: number;
};

const localhostOnly = () => {
    const url = process.env.BETTER_AUTH_URL ?? "";
    if (new URL(url).hostname !== "localhost") {
        throw new Error(
            `BETTER_AUTH_URL is ${url}. This writes a signed-in session for an ` +
                "account nobody owns, so it only runs against a local app and " +
                "the database that app is pointed at.",
        );
    }
};

// better-call signs the session cookie as `token.signature`, where the
// signature is an HMAC-SHA256 of the token under the auth secret, and then
// percent-encodes the pair. Mirror it exactly or the server reads the cookie as
// a forgery and treats the request as signed out.
const signedCookieValue = async (token: string, secret: string) => {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(token),
    );
    const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return encodeURIComponent(`${token}.${encoded}`);
};

const countRows = async (): Promise<Counts | null> => {
    const result = await getPool().query<Counts>(
        `select
             (select count(*) from lists where user_id = u.id)::int as lists,
             (select count(*) from applications a
                 join lists l on l.id = a.list_id
                 where l.user_id = u.id)::int as applications,
             (select count(*) from application_events e
                 join applications a on a.id = e.application_id
                 join lists l on l.id = a.list_id
                 where l.user_id = u.id)::int as events,
             (select count(*) from user_settings
                 where user_id = u.id)::int as settings,
             (select count(*) from "session"
                 where "userId" = u.id)::int as sessions,
             (select count(*) from email_suggestions
                 where user_id = u.id)::int as suggestions
         from "user" u
         where u.email = $1`,
        [EMAIL],
    );
    return result.rows[0] ?? null;
};

const describe = (counts: Counts) =>
    [
        `${counts.lists} list`,
        `${counts.applications} applications`,
        `${counts.events} status events`,
        `${counts.settings} preferences row`,
        `${counts.sessions} session`,
        `${counts.suggestions} inbox suggestions`,
    ].join(", ");

const check = async () => {
    const counts = await countRows();
    if (!counts) {
        console.log(`No account for ${EMAIL}. Everything it held is gone.`);
        return;
    }
    console.log(`${EMAIL} still exists: ${describe(counts)}.`);
};

const create = async () => {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error(
            "BETTER_AUTH_SECRET is not set. The cookie is signed with it, so " +
                "without it the browser cannot be signed in.",
        );
    }
    const pool = getPool();

    // Start from nothing, so a run after a half-finished test is not read as
    // proof that deletion left rows behind.
    await pool.query(`delete from "user" where email = $1`, [EMAIL]);

    const userId = crypto.randomUUID();
    await pool.query(
        `insert into "user" ("id", "name", "email", "emailVerified")
         values ($1, $2, $3, true)`,
        [userId, NAME, EMAIL],
    );

    const list = await pool.query<{ id: string }>(
        `insert into lists (user_id, name, description)
         values ($1, $2, $3) returning id`,
        [
            userId,
            "Fall 2026",
            "Applications for a throwaway account, safe to delete.",
        ],
    );
    const listId = list.rows[0].id;

    const values = APPLICATIONS.flatMap(([company, role, status], position) => [
        listId,
        position,
        company,
        role,
        status,
        status === "not_applied" ? null : new Date(),
    ]);
    const tuples = APPLICATIONS.map(
        (_, index) =>
            `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, ` +
            `$${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`,
    );
    await pool.query(
        `insert into applications
             (list_id, position, company_name, role_title, status, applied_at)
         values ${tuples.join(", ")}`,
        values,
    );

    // Every row opens its trail where it was created, the way the app writes
    // one. The rows past 'applied' then carry a move on top of that.
    await pool.query(
        `insert into application_events
             (application_id, from_status, to_status, occurred_at)
         select
             a.id,
             null,
             case
                 when a.status in ('not_applied', 'applied') then a.status
                 else 'applied'::application_status
             end,
             now() - interval '7 days'
         from applications a
         where a.list_id = $1`,
        [listId],
    );

    await pool.query(
        `insert into application_events (application_id, from_status, to_status)
         select a.id, 'applied'::application_status, a.status
         from applications a
         where a.list_id = $1 and a.status not in ('not_applied', 'applied')`,
        [listId],
    );

    await pool.query(
        `insert into user_settings (user_id, default_currency) values ($1, 'CAD')`,
        [userId],
    );

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await pool.query(
        `insert into "session" ("id", "token", "userId", "expiresAt", "updatedAt")
         values ($1, $2, $3, $4, now())`,
        [crypto.randomUUID(), token, userId, expiresAt],
    );

    const counts = await countRows();
    const cookie = await signedCookieValue(token, secret);

    console.log(`Created ${EMAIL}: ${describe(counts as Counts)}.`);
    console.log(`User id ${userId}.`);
    console.log(
        "\nPaste this into the browser console on the dev server, then reload:\n",
    );
    console.log(
        `document.cookie = "${COOKIE_NAME}=${cookie}; path=/; max-age=${SESSION_DAYS * 86_400}";\n`,
    );
    console.log(
        "Delete the account from Settings, then run `bun run db:test-account check`.",
    );
};

const main = async () => {
    localhostOnly();
    await (process.argv[2] === "check" ? check() : create());
    await getPool().end();
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
