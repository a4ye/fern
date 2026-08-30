// Replaces one dedicated list with a repeatable set of history examples.
// It is intentionally separate from db/seed.ts, which is for table load tests.
//
//   bun run db:seed-history
//   bun run db:seed-history you@example.com

import { randomUUID } from "node:crypto";
import { getPool } from "../src/db/client";
import {
    encodeHistoryActions,
    HISTORY_KIND,
    type StoredApplication,
    type StoredApplicationEvent,
    type StoredHistoryAction,
} from "../src/db/history";

const FIXTURE_NAME = "History UI review";
const APPLICATION_COUNT = 70;

const COMPANY_PREFIXES = [
    "Alder",
    "Bluebird",
    "Cedar",
    "Driftwood",
    "Evergreen",
    "Foxglove",
    "Granite",
    "Harbor",
    "Juniper",
    "Kestrel",
];

const COMPANY_SUFFIXES = [
    "Systems",
    "Health",
    "Logistics",
    "Software",
    "Energy",
    "Robotics",
    "Financial",
];

const ROLES = [
    "Software Engineer",
    "Data Engineer",
    "Product Engineer",
    "Platform Engineer",
    "Backend Engineer",
];

type FixtureApplication = {
    id: string;
    position: number;
    company: string;
    role: string;
};

type ActionDraft = {
    key: string;
    kind: number;
    affectedCount: number;
    data: (idFor: (key: string) => string) => unknown;
    archived?: boolean;
    reversible?: boolean;
    undoneBy?: string;
};

const storedApplication = (
    application: FixtureApplication,
    overrides: Partial<StoredApplication> = {},
): StoredApplication => ({
    id: application.id,
    position: application.position,
    company_name: application.company,
    role_title: application.role,
    status: "applied",
    url: `https://jobs.example.com/${application.position}`,
    location: "Toronto, ON",
    arrangement: "remote",
    notes: null,
    pay_min: "110000.00",
    pay_max: "145000.00",
    pay_currency: "CAD",
    pay_period: "yearly",
    bonus_amount: null,
    pay_note: null,
    applied_at: "2026-08-20",
    created_at: "2026-08-20T13:00:00.000Z",
    updated_at: "2026-08-20T13:00:00.000Z",
    created_by_history_action_id: null,
    ...overrides,
});

const storedEvent = (
    applicationId: string,
    fromStatus: string | null,
    toStatus: string | null,
    note: string | null = null,
): StoredApplicationEvent => ({
    id: randomUUID(),
    application_id: applicationId,
    from_status: fromStatus,
    to_status: toStatus,
    note,
    occurred_at: "2026-08-22T16:00:00.000Z",
    history_action_id: null,
});

const patch = (
    application: FixtureApplication,
    fields: Record<string, [string | null, string | null]>,
    currency?: [string | null, string | null],
) => ({
    i: application.id,
    n: application.company,
    f: fields,
    ...(currency ? { p: currency } : {}),
});

const applicationRows = () =>
    Array.from({ length: APPLICATION_COUNT }, (_, position) => ({
        position,
        company:
            COMPANY_PREFIXES[position % COMPANY_PREFIXES.length] +
            " " +
            COMPANY_SUFFIXES[
                Math.floor(position / COMPANY_PREFIXES.length) %
                    COMPANY_SUFFIXES.length
            ],
        role:
            position === 0
                ? "Senior Platform Engineer"
                : ROLES[position % ROLES.length],
        status: position % 7 === 0 ? "interviewing" : "applied",
        url: `https://jobs.example.com/${position}`,
        location: position % 3 === 0 ? "Toronto, ON" : "Remote",
        arrangement: position % 3 === 0 ? "hybrid" : "remote",
        payMin: String(90_000 + position * 500),
        payMax: String(125_000 + position * 500),
        currency: position % 4 === 0 ? "USD" : "CAD",
        period: "yearly",
        appliedAt: "2026-08-20",
    }));

const buildActions = (applications: FixtureApplication[]): ActionDraft[] => {
    const drafts: ActionDraft[] = [];
    const add = (draft: ActionDraft) => drafts.push(draft);
    const first = applications[0];
    const second = applications[1];
    const third = applications[2];
    const imported = applications.slice(0, 63);
    const deletedOne: FixtureApplication = {
        id: randomUUID(),
        position: 90,
        company: "Maple Health",
        role: "Data Engineer",
    };
    const deletedTwo: FixtureApplication = {
        id: randomUUID(),
        position: 91,
        company: "Summit Labs",
        role: "Software Engineer",
    };

    add({
        key: "archived-empty",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({}),
        archived: true,
    });
    add({
        key: "archived-import",
        kind: HISTORY_KIND.import,
        affectedCount: 31,
        data: () => ({
            m: applications.slice(0, 31).map((application) => ({
                n: application.company,
                r: application.role,
            })),
        }),
        archived: true,
    });
    add({
        key: "many-variations",
        kind: HISTORY_KIND.edit,
        affectedCount: 30,
        data: () => ({
            a: applications.slice(0, 30).map((application, index) =>
                patch(application, {
                    r: [
                        `Engineer ${index + 1}`,
                        `Senior Engineer ${index + 1}`,
                    ],
                }),
            ),
        }),
        archived: true,
    });
    add({
        key: "archived-list",
        kind: HISTORY_KIND.list,
        affectedCount: 1,
        data: () => ({
            f: {
                d: ["Applications for the summer search", null],
                s: ["active", "archived"],
            },
        }),
        archived: true,
    });
    add({
        key: "archived-delete",
        kind: HISTORY_KIND.delete,
        affectedCount: 2,
        data: () => ({
            d: [storedApplication(deletedOne), storedApplication(deletedTwo)],
        }),
        archived: true,
    });
    add({
        key: "created",
        kind: HISTORY_KIND.create,
        affectedCount: 1,
        data: () => ({ m: [{ n: "Summit Labs", r: "Software Engineer" }] }),
    });
    add({
        key: "imported",
        kind: HISTORY_KIND.import,
        affectedCount: imported.length,
        data: () => ({
            m: imported.map((application) => ({
                n: application.company,
                r: application.role,
            })),
        }),
    });
    add({
        key: "list-details",
        kind: HISTORY_KIND.list,
        affectedCount: 1,
        data: () => ({
            f: {
                n: ["Job search", FIXTURE_NAME],
                d: [
                    "A short list description.",
                    "Examples for checking every history layout and value style.",
                ],
                s: ["active", "closed"],
            },
        }),
    });
    add({
        key: "set-fields",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [
                patch(
                    second,
                    {
                        r: [null, "Product Engineer"],
                        u: [null, "https://jobs.example.com/product-engineer"],
                        l: [null, "Vancouver, BC"],
                        a: [null, "hybrid"],
                        n: [null, "Referred by a former teammate."],
                        mi: [null, "125000.00"],
                        ma: [null, "165000.00"],
                        pe: [null, "yearly"],
                        b: [null, "12000.00"],
                        pn: [
                            null,
                            "Equity is discussed after the final interview.",
                        ],
                        d: [null, "2026-08-24"],
                    },
                    ["CAD", "CAD"],
                ),
            ],
        }),
    });
    add({
        key: "change-fields",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [
                patch(first, {
                    c: ["Alder Technologies", first.company],
                    r: ["Platform Engineer", "Senior Platform Engineer"],
                    s: ["applied", "onsite"],
                    u: [
                        "https://jobs.example.com/platform",
                        "https://careers.example.com/senior-platform-engineer",
                    ],
                    l: ["Toronto, ON", "New York, NY"],
                    a: ["remote", "hybrid"],
                    n: [
                        "Recruiter screen booked.",
                        "Recruiter screen completed. The next step is system design.",
                    ],
                    mi: ["110000.00", "130000.00"],
                    ma: ["145000.00", "175000.00"],
                    cu: ["USD", "CAD"],
                    pe: ["monthly", "yearly"],
                    b: ["5000.00", "15000.00"],
                    pn: ["Bonus included", "Bonus and equity are separate"],
                    d: ["2026-08-20", "2026-08-24"],
                }),
            ],
        }),
    });
    add({
        key: "clear-fields",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [
                patch(third, {
                    r: ["Data Engineer", null],
                    u: ["https://jobs.example.com/data", null],
                    l: ["Montreal, QC", null],
                    a: ["onsite", null],
                    n: ["Waiting for the hiring manager.", null],
                    mi: ["90000.00", null],
                    ma: ["120000.00", null],
                    pe: ["yearly", null],
                    b: ["7000.00", null],
                    pn: ["Salary is negotiable", null],
                    d: ["2026-08-18", null],
                }),
            ],
        }),
    });
    add({
        key: "bulk-edit",
        kind: HISTORY_KIND.edit,
        affectedCount: 18,
        data: () => ({
            a: applications.slice(0, 18).map((application, index) =>
                patch(application, {
                    r:
                        index < 9
                            ? ["Software Engineer", "Senior Software Engineer"]
                            : ["Senior Software Engineer", "Software Engineer"],
                    d: [null, "2026-08-24"],
                }),
            ),
        }),
    });
    add({
        key: "bulk-status",
        kind: HISTORY_KIND.status,
        affectedCount: imported.length,
        data: () => ({
            a: imported.map((application) =>
                patch(application, { s: ["applied", "interviewing"] }),
            ),
        }),
    });
    add({
        key: "mixed-status",
        kind: HISTORY_KIND.status,
        affectedCount: 24,
        data: () => ({
            a: applications.slice(0, 24).map((application, index) =>
                patch(application, {
                    s:
                        index < 12
                            ? ["applied", "interviewing"]
                            : ["onsite", "rejected"],
                }),
            ),
        }),
    });
    add({
        key: "bulk-arrangement",
        kind: HISTORY_KIND.arrangement,
        affectedCount: 18,
        data: () => ({
            a: applications.slice(0, 18).map((application, index) =>
                patch(application, {
                    a: index < 9 ? ["remote", "hybrid"] : ["onsite", null],
                }),
            ),
        }),
    });
    add({
        key: "deleted",
        kind: HISTORY_KIND.delete,
        affectedCount: 1,
        data: () => ({ d: [storedApplication(deletedOne)] }),
    });
    add({
        key: "step-added",
        kind: HISTORY_KIND.steps,
        affectedCount: 1,
        data: () => ({
            n: second.company,
            g: [storedEvent(second.id, "applied", "interviewing")],
        }),
    });
    add({
        key: "step-removed",
        kind: HISTORY_KIND.steps,
        affectedCount: 1,
        data: () => ({
            n: third.company,
            e: [storedEvent(third.id, "interviewing", "onsite")],
        }),
    });
    add({
        key: "undo-root",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [patch(second, { l: ["Toronto, ON", "Boston, MA"] })],
        }),
        undoneBy: "undo",
    });
    add({
        key: "undo",
        kind: HISTORY_KIND.undo,
        affectedCount: 1,
        data: (idFor) => ({
            o: idFor("undo-root"),
            r: idFor("undo-root"),
            q: 0,
            n: `Updated ${second.company}`,
        }),
    });
    add({
        key: "redo-root",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [patch(third, { r: ["Data Engineer", "Senior Data Engineer"] })],
        }),
    });
    add({
        key: "redo",
        kind: HISTORY_KIND.undo,
        affectedCount: 1,
        data: (idFor) => ({
            o: idFor("redo-root"),
            r: idFor("redo-root"),
            q: 1,
            n: `Updated ${third.company}`,
        }),
    });
    add({
        key: "restore",
        kind: HISTORY_KIND.restore,
        affectedCount: 6,
        data: (idFor) => ({
            n: "Changed the status of 24 applications",
            o: idFor("mixed-status"),
            t: "2026-08-24T14:30:00.000Z",
            m: [
                { i: third.id, n: third.company, r: third.role },
                {
                    i: applications[3].id,
                    n: applications[3].company,
                    r: applications[3].role,
                },
            ],
            v: {
                a: [
                    patch(first, {
                        r: ["Senior Platform Engineer", "Platform Engineer"],
                    }),
                    patch(second, { s: ["interviewing", "applied"] }),
                ],
                c: [storedApplication(applications[4])],
                d: [storedApplication(deletedTwo)],
                e: {
                    c: [storedEvent(third.id, "applied", "interviewing")],
                    d: [
                        storedEvent(
                            applications[3].id,
                            "interviewing",
                            "onsite",
                        ),
                    ],
                },
                f: {
                    n: [FIXTURE_NAME, "Earlier job search"],
                    d: [
                        "Examples for checking every history layout and value style.",
                        null,
                    ],
                    s: ["active", "closed"],
                },
            },
        }),
    });
    add({
        key: "legacy-link",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [patch(first, { u: [null, "not a valid web address"] })],
        }),
    });
    add({
        key: "long-text",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [
                patch(second, {
                    n: [
                        "Short interview note.",
                        "The recruiter explained that the process has a technical screen, a system design discussion, and a final conversation with the engineering manager. Follow up next Tuesday if the schedule has not arrived.",
                    ],
                    pn: [
                        "Standard package",
                        "Base salary, annual bonus, and equity are discussed separately. The recruiter will share the complete range before the final interview.",
                    ],
                }),
            ],
        }),
    });
    add({
        key: "legacy-empty",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({ n: "Legacy application" }),
    });
    add({
        key: "single-status",
        kind: HISTORY_KIND.status,
        affectedCount: 1,
        data: () => ({
            a: [patch(second, { s: ["applied", "online_assessment"] })],
        }),
    });
    add({
        key: "clear-arrangement",
        kind: HISTORY_KIND.arrangement,
        affectedCount: 1,
        data: () => ({ a: [patch(third, { a: ["hybrid", null] })] }),
    });
    add({
        key: "latest-edit",
        kind: HISTORY_KIND.edit,
        affectedCount: 1,
        data: () => ({
            a: [
                patch(first, {
                    r: ["Platform Engineer", "Senior Platform Engineer"],
                }),
            ],
        }),
        reversible: true,
    });

    return drafts;
};

const main = async () => {
    const email = process.argv[2] ?? null;
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query("begin");
        const owner = email
            ? await client.query<{ id: string; email: string }>(
                  `select id, email from "user" where email = $1`,
                  [email],
              )
            : await client.query<{ id: string; email: string }>(
                  `select id, email from "user" order by "createdAt" limit 1`,
              );
        const user = owner.rows[0];
        if (!user) {
            throw new Error(
                email
                    ? `No user with email ${email}. Sign in once, then run this again.`
                    : "No users yet. Sign in once, then run this again.",
            );
        }

        const existing = await client.query<{ id: string }>(
            `select id from lists where user_id = $1 and name = $2 limit 1`,
            [user.id, FIXTURE_NAME],
        );
        let listId = existing.rows[0]?.id;
        if (listId) {
            await client.query(
                `delete from list_history_archives where list_id = $1`,
                [listId],
            );
            await client.query(
                `delete from list_history_actions where list_id = $1`,
                [listId],
            );
            await client.query(`delete from applications where list_id = $1`, [
                listId,
            ]);
            await client.query(
                `update lists
                 set description = $1, status = 'active'
                 where id = $2`,
                [
                    "Examples for checking every history layout and value style.",
                    listId,
                ],
            );
        } else {
            const listResult = await client.query<{ id: string }>(
                `insert into lists (user_id, name, description)
                 values ($1, $2, $3)
                 returning id`,
                [
                    user.id,
                    FIXTURE_NAME,
                    "Examples for checking every history layout and value style.",
                ],
            );
            listId = listResult.rows[0]?.id;
        }
        if (!listId) {
            throw new Error("Could not create the history review list.");
        }

        const rows = applicationRows();
        const inserted = await client.query<FixtureApplication>(
            `insert into applications (
                list_id, position, company_name, role_title, status, url,
                location, arrangement, pay_min, pay_max, pay_currency,
                pay_period, applied_at
             )
             select
                $1::uuid,
                (item->>'position')::int,
                item->>'company',
                item->>'role',
                (item->>'status')::application_status,
                item->>'url',
                item->>'location',
                (item->>'arrangement')::work_arrangement,
                (item->>'payMin')::numeric,
                (item->>'payMax')::numeric,
                item->>'currency',
                (item->>'period')::pay_period,
                (item->>'appliedAt')::date
             from jsonb_array_elements($2::jsonb) item
             order by (item->>'position')::int
             returning id, position, company_name as company, role_title as role`,
            [listId, JSON.stringify(rows)],
        );
        const applications = inserted.rows.sort(
            (left, right) => left.position - right.position,
        );
        const drafts = buildActions(applications);
        const reserved = await client.query<{ id: string }>(
            `select nextval('list_history_action_id_seq')::text as id
             from generate_series(1, $1::int)`,
            [drafts.length],
        );
        const ids = reserved.rows.map((row) => row.id);
        const idByKey = new Map(
            drafts.map((draft, index) => [draft.key, ids[index]]),
        );
        const idFor = (key: string) => {
            const id = idByKey.get(key);
            if (!id) throw new Error(`Unknown history fixture action: ${key}`);
            return id;
        };
        const base = Date.now();
        const times = drafts.map((_, index) =>
            new Date(
                base - (drafts.length - index) * 3 * 60 * 60 * 1_000,
            ).toISOString(),
        );
        const actions: StoredHistoryAction[] = drafts.map((draft, index) => ({
            id: ids[index],
            kind: draft.kind,
            affectedCount: draft.affectedCount,
            data: draft.data(idFor),
            reversible: draft.reversible ?? false,
            occurredAt: times[index],
            undoneAt: draft.undoneBy
                ? times[drafts.findIndex((item) => item.key === draft.undoneBy)]
                : null,
        }));

        for (const [index, action] of actions.entries()) {
            if (drafts[index].archived) continue;
            await client.query(
                `insert into list_history_actions (
                    id, list_id, kind, affected_count, data, reversible,
                    occurred_at, undone_at
                 ) values ($1::bigint, $2::uuid, $3::smallint, $4::int,
                    $5::jsonb, $6, $7::timestamptz, $8::timestamptz)`,
                [
                    action.id,
                    listId,
                    action.kind,
                    action.affectedCount,
                    JSON.stringify(action.data),
                    action.reversible,
                    action.occurredAt,
                    action.undoneAt,
                ],
            );
        }

        const archived = actions.filter((_, index) => drafts[index].archived);
        if (archived.length > 0) {
            await client.query(
                `insert into list_history_archives (
                    first_action_id, list_id, last_action_id,
                    first_occurred_at, last_occurred_at, action_count, payload
                 ) values ($1::bigint, $2::uuid, $3::bigint,
                    $4::timestamptz, $5::timestamptz, $6::int, $7::bytea)`,
                [
                    archived[0].id,
                    listId,
                    archived.at(-1)?.id,
                    archived[0].occurredAt,
                    archived.at(-1)?.occurredAt,
                    archived.length,
                    encodeHistoryActions(archived),
                ],
            );
        }

        await client.query("commit");
        console.log(
            `Seeded "${FIXTURE_NAME}" with ${actions.length} history examples for ${user.email}.`,
        );
        console.log(`http://localhost:3000/dashboard/${listId}`);
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
