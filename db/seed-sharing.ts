// Puts the friends and sharing feature into every state it can be in, so all of
// it can be looked at without two browsers and a wait for a link to lapse.
//
//   bun run db:seed-sharing              # for the first user found
//   bun run db:seed-sharing you@example.com
//   bun run db:seed-sharing --clear      # take it all back out again
//
// It creates four demo accounts and wires them to yours: one friend who shares
// with all their friends, one who shared a list with you by name, one waiting
// on you to answer, and one real GitHub account you can add by username to try
// that path yourself. It also puts an active, an expired and a revoked link on
// one of your own lists, since the last two are otherwise hard to produce.
//
// Re-running replaces what it made. The demo accounts are deleted first, and
// every row they own goes with them.

import { getPool } from "../src/db/client";

// Fixed ids so a second run replaces the first rather than piling up. The
// invalid TLD is reserved by RFC 2606 and can never be a real address, so
// nothing here can collide with somebody who signs in for real.
const DEMO_SUFFIX = "@job-tracker.invalid";

type Demo = {
    id: string;
    name: string;
    // GitHub's numeric id, which is what a sign-in stores and what adding a
    // friend by username resolves to. These are real accounts, so the avatars
    // load and `octocat` can actually be looked up.
    githubId: string;
    listName: string;
    listDescription: string;
};

const DEMOS = {
    mira: {
        id: "demo-mira-chen",
        name: "Mira Chen",
        githubId: "1",
        listName: "Winter 2027 Internships",
        listDescription: "Backend and infra, mostly Toronto",
    },
    devon: {
        id: "demo-devon-park",
        name: "Devon Park",
        githubId: "2",
        listName: "New Grad 2027",
        listDescription: "Anything that will take me",
    },
    sam: {
        id: "demo-sam-okafor",
        name: "Sam Okafor",
        githubId: "3",
        listName: "Summer 2027",
        listDescription: "",
    },
    octocat: {
        id: "demo-octocat",
        name: "The Octocat",
        githubId: "583231",
        listName: "Fall 2027",
        listDescription: "",
    },
} satisfies Record<string, Demo>;

const APPLICATIONS: [string, string, string, string | null][] = [
    ["Stripe", "Backend Engineer Intern", "offer_in_progress", "2026-09-02"],
    ["Figma", "Software Engineer Intern", "onsite", "2026-09-04"],
    ["Ramp", "Platform Engineer Intern", "interviewing", "2026-09-05"],
    ["Notion", "Full Stack Intern", "interviewing", "2026-09-06"],
    ["Linear", "Product Engineer Intern", "takehome", "2026-09-08"],
    ["Vercel", "Infrastructure Intern", "online_assessment", "2026-09-09"],
    ["Shopify", "Backend Intern", "applied", "2026-09-11"],
    ["Wealthsimple", "Software Engineer Intern", "applied", "2026-09-12"],
    ["Cohere", "ML Platform Intern", "rejected", "2026-08-21"],
    ["Databricks", "Software Engineer Intern", "rejected", "2026-08-14"],
    ["Jane Street", "Software Engineer Intern", "ghosted", "2026-07-30"],
    ["Palantir", "Forward Deployed Intern", "not_applied", null],
];

const PAY: [string, string, string][] = [
    ["55", "70", "hourly"],
    ["48", "60", "hourly"],
    ["8000", "9500", "monthly"],
];

const pool = getPool();

const demoIds = Object.values(DEMOS).map((demo) => demo.id);

// Everything these accounts own is reachable from the user row by cascade, so
// removing them is the whole of the cleanup: their lists, applications,
// friendships with you, and the grants either side made.
const clearDemos = async () => {
    await pool.query(`delete from "user" where id = any($1::text[])`, [
        demoIds,
    ]);
};

const targetUser = async (email?: string) => {
    const { rows } = email
        ? await pool.query<{ id: string; name: string; email: string }>(
              `select id, name, email from "user" where email = $1`,
              [email],
          )
        : await pool.query<{ id: string; name: string; email: string }>(
              `select id, name, email from "user"
               where id <> all($1::text[])
               order by "createdAt" limit 1`,
              [demoIds],
          );

    if (rows.length === 0) {
        throw new Error(
            email
                ? `No account for ${email}. Sign in first, then run this.`
                : "No accounts in this database. Sign in first, then run this.",
        );
    }
    return rows[0];
};

const createDemo = async (demo: Demo): Promise<string> => {
    await pool.query(
        `insert into "user" (id, name, email, "emailVerified", image,
            "createdAt", "updatedAt")
         values ($1, $2, $3, true, $4, now(), now())`,
        [
            demo.id,
            demo.name,
            `${demo.id}${DEMO_SUFFIX}`,
            `https://avatars.githubusercontent.com/u/${demo.githubId}?v=4`,
        ],
    );

    // The account row is what adding a friend by username lands on, so it
    // carries the same provider and numeric id a real sign-in would.
    await pool.query(
        `insert into "account" (id, "accountId", "providerId", "userId",
            "createdAt", "updatedAt")
         values ($1, $2, 'github', $3, now(), now())`,
        [`${demo.id}-github`, demo.githubId, demo.id],
    );

    const { rows } = await pool.query<{ id: string }>(
        `insert into lists (user_id, name, description)
         values ($1, $2, $3) returning id`,
        [demo.id, demo.listName, demo.listDescription || null],
    );
    const listId = rows[0].id;

    for (const [index, app] of APPLICATIONS.entries()) {
        const [company, role, status, appliedAt] = app;
        const [min, max, period] = PAY[index % PAY.length];
        await pool.query(
            `insert into applications (list_id, company_name, role_title,
                status, location, arrangement, pay_min, pay_max, pay_currency,
                pay_period, applied_at)
             values ($1, $2, $3, $4::application_status, $5,
                $6::work_arrangement, $7, $8, 'CAD', $9::pay_period, $10)`,
            [
                listId,
                company,
                role,
                status,
                index % 3 === 0 ? "Toronto, ON" : "Remote",
                index % 3 === 0 ? "onsite" : "remote",
                min,
                max,
                period,
                appliedAt,
            ],
        );
    }

    return listId;
};

const befriend = async (
    requesterId: string,
    addresseeId: string,
    accepted: boolean,
) => {
    await pool.query(
        `insert into friendships (requester_id, addressee_id, status,
            accepted_at)
         values ($1, $2, $3::friendship_status, $4)`,
        [
            requesterId,
            addresseeId,
            accepted ? "accepted" : "pending",
            accepted ? new Date() : null,
        ],
    );
};

const shareWithFriends = async (listId: string) => {
    await pool.query(
        `insert into list_shares (list_id, audience) values ($1, 'friends')`,
        [listId],
    );
};

const shareWithPerson = async (listId: string, granteeId: string) => {
    await pool.query(
        `insert into list_shares (list_id, audience, grantee_id)
         values ($1, 'person', $2)`,
        [listId, granteeId],
    );
};

// A token of the shape the app makes, so the page's own guard accepts it.
const token = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
};

const addLink = async (
    listId: string,
    options: { expiresAt: Date | null; revoked: boolean; views: number },
): Promise<string> => {
    const value = token();
    await pool.query(
        `insert into list_links (list_id, token, expires_at, revoked_at,
            view_count, last_viewed_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [
            listId,
            value,
            options.expiresAt,
            options.revoked ? new Date() : null,
            options.views,
            options.views > 0 ? new Date() : null,
        ],
    );
    return value;
};

const days = (count: number): Date =>
    new Date(Date.now() + count * 24 * 60 * 60 * 1000);

const run = async () => {
    const argument = process.argv[2];
    await clearDemos();

    if (argument === "--clear") {
        console.log("Removed the demo accounts and everything they owned.");
        return;
    }

    const user = await targetUser(argument);

    const miraList = await createDemo(DEMOS.mira);
    const devonList = await createDemo(DEMOS.devon);
    await createDemo(DEMOS.sam);
    await createDemo(DEMOS.octocat);

    // Mira shares with everyone she is friends with, so her list reaches you
    // through the standing rule rather than by name.
    await befriend(DEMOS.mira.id, user.id, true);
    await shareWithFriends(miraList);

    // Devon named you specifically.
    await befriend(user.id, DEMOS.devon.id, true);
    await shareWithPerson(devonList, user.id);

    // Sam is waiting on you to answer.
    await befriend(DEMOS.sam.id, user.id, false);

    // Octocat is nobody to you yet, which is the point: their GitHub username
    // is real, so adding them is the whole flow rather than a fixture.

    // One of your own lists, so the share dialog opens onto something. Picked
    // by most recent so it is a list you were actually working in.
    const { rows: mine } = await pool.query<{ id: string; name: string }>(
        `select id, name from lists
         where user_id = $1 and status = 'active'
         order by updated_at desc limit 1`,
        [user.id],
    );

    if (mine.length === 0) {
        console.log("No active list of your own, so nothing was shared out.");
        return;
    }

    const list = mine[0];
    await shareWithPerson(list.id, DEMOS.mira.id);
    await shareWithFriends(list.id);

    const live = await addLink(list.id, {
        expiresAt: days(30),
        revoked: false,
        views: 7,
    });
    await addLink(list.id, {
        expiresAt: null,
        revoked: false,
        views: 0,
    });
    await addLink(list.id, {
        expiresAt: days(-2),
        revoked: false,
        views: 12,
    });
    await addLink(list.id, {
        expiresAt: null,
        revoked: true,
        views: 3,
    });

    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

    console.log(
        [
            `Wired up for ${user.name} <${user.email}>.`,
            "",
            "Shared with you, on /dashboard:",
            `  ${DEMOS.mira.name} — ${DEMOS.mira.listName} (through all friends)`,
            `  ${DEMOS.devon.name} — ${DEMOS.devon.listName} (shared by name)`,
            "",
            "On /dashboard/friends:",
            `  ${DEMOS.sam.name} is waiting for you to accept or decline`,
            `  add "octocat" by username to try sending one yourself`,
            "",
            `Share dialog on your list "${list.name}" holds four links:`,
            "  active expiring in 30 days, active never expiring,",
            "  expired two days ago, and revoked",
            "",
            "Open the live one signed out:",
            `  ${base}/s/${live}`,
            "",
            "Undo all of it with: bun run db:seed-sharing --clear",
        ].join("\n"),
    );
};

await run();
await pool.end();
