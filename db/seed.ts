// Fills a list with enough varied applications to exercise the table: sorting
// every column, filtering both facets, searching, and the row windowing that
// only switches on past a couple of hundred rows.
//
//   bun run db:seed                  # 1000 rows for the first user found
//   bun run db:seed 5000             # a different size
//   bun run db:seed 1000 you@example.com
//
// Variety is the point. Every status appears, pay is written in several
// currencies and periods, and a share of every optional column is left empty,
// because blank cells are what sorting and filtering get wrong.

import { getPool } from "../src/db/client";

const COMPANIES = [
    "Northwind Logistics",
    "Acme Robotics",
    "Bluewave Health",
    "Cobalt Systems",
    "Driftwood Media",
    "Everline Bank",
    "Foxglove Labs",
    "Granite Analytics",
    "Harborview Energy",
    "Ironleaf Software",
    "Junction Mobility",
    "Kestrel Aero",
    "Lanternfish Games",
    "Meridian Freight",
    "Northgate Retail",
    "Orchard Foods",
    "Pinehurst Insurance",
    "Quarry Materials",
    "Redcedar Telecom",
    "Saltmarsh Marine",
    "Thornbury Pharma",
    "Umberland Textiles",
    "Vantage Payments",
    "Westbrook Studios",
    "Yarrow Biotech",
    "Zephyr Networks",
    "Alderman Legal",
    "Briarwood Hotels",
    "Copperfield Mining",
    "Dunmore Shipping",
];

const ROLES = [
    "Software Engineer",
    "Senior Software Engineer",
    "Backend Engineer",
    "Frontend Engineer",
    "Full Stack Engineer",
    "Platform Engineer",
    "Infrastructure Engineer",
    "Data Engineer",
    "Machine Learning Engineer",
    "Site Reliability Engineer",
    "Mobile Engineer",
    "Security Engineer",
    "Software Engineer Intern",
    "Data Scientist",
    "Product Engineer",
];

// Numbered so a text sort has something to get right: "Engineer 2" belongs
// before "Engineer 10", which is only true if the digits are read as a number.
const LEVELS = ["", "", "", " I", " II", " III", " 2", " 10"];

const LOCATIONS = [
    "Toronto, ON",
    "Vancouver, BC",
    "Montreal, QC",
    "Waterloo, ON",
    "Ottawa, ON",
    "New York, NY",
    "San Francisco, CA",
    "Seattle, WA",
    "Austin, TX",
    "Boston, MA",
    "London, UK",
    "Dublin, IE",
    "Berlin, DE",
    "Amsterdam, NL",
    "Singapore",
];

const STATUSES = [
    "not_applied",
    "applied",
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
    "offer_in_progress",
    "offer_accepted",
    "offer_declined",
    "offer_rescinded",
    "rejected",
    "ghosted",
    "other",
] as const;

// Weighted towards the middle of the pipeline, the way a real list sits: most
// applications are sent and waiting, a few reach an offer.
const STATUS_WEIGHTS = [4, 30, 10, 5, 12, 6, 3, 2, 1, 1, 18, 6, 2];

const ARRANGEMENTS = [null, "remote", "hybrid", "onsite"] as const;

// Rates as well as salaries, so the pay column has to put both on one clock
// before it can order them, and in several currencies, which it cannot convert.
const PAY_SHAPES = [
    { min: 90_000, max: 130_000, period: "yearly", currency: "USD" },
    { min: 120_000, max: 160_000, period: "yearly", currency: "USD" },
    { min: 85_000, max: 110_000, period: "yearly", currency: "CAD" },
    { min: 55_000, max: 75_000, period: "yearly", currency: "GBP" },
    { min: 70_000, max: 95_000, period: "yearly", currency: "EUR" },
    { min: 40, max: 65, period: "hourly", currency: "USD" },
    { min: 28, max: 45, period: "hourly", currency: "CAD" },
    { min: 7_000, max: 9_500, period: "monthly", currency: "USD" },
    { min: 2_400, max: 3_200, period: "biweekly", currency: "USD" },
] as const;

const PAY_NOTES = [
    "Competitive",
    "Not listed",
    "Equity heavy",
    "To be discussed",
    "DOE",
];

const NOTES = [
    "Referred by a friend on the infra team. Recruiter said the loop is four rounds.",
    "Applied through the careers page. No recruiter contact yet.",
    "Met them at a career fair. Follow up in two weeks if nothing comes back.",
    "Took the assessment on a Sunday, two hours, mostly graph problems.",
    "Team works on the billing platform. Mostly Go and Postgres.",
    "Onsite is a full day, five sessions including a system design round.",
    "Recruiter mentioned the band tops out lower than posted. Worth negotiating.",
];

// A deterministic generator, so two runs of the same size give the same list and
// a bug found in one run can be looked at again in the next.
const random = (seed: number) => {
    let state = seed;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return state / 4_294_967_296;
    };
};

const parseArgs = () => {
    const [size, email] = process.argv.slice(2);
    const rows = size ? Number(size) : 1000;
    if (!Number.isInteger(rows) || rows < 1) {
        throw new Error(
            `Row count must be a positive whole number, got ${size}`,
        );
    }
    return { rows, email: email ?? null };
};

const main = async () => {
    const { rows, email } = parseArgs();
    const pool = getPool();
    const next = random(rows);

    const pick = <T>(values: readonly T[]): T =>
        values[Math.floor(next() * values.length)];

    const pickStatus = () => {
        const total = STATUS_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
        let ticket = next() * total;
        for (const [index, weight] of STATUS_WEIGHTS.entries()) {
            ticket -= weight;
            if (ticket <= 0) return STATUSES[index];
        }
        return "applied" as const;
    };

    const owner = email
        ? await pool.query<{ id: string; email: string }>(
              `select id, email from "user" where email = $1`,
              [email],
          )
        : await pool.query<{ id: string; email: string }>(
              `select id, email from "user" order by "createdAt" limit 1`,
          );

    const user = owner.rows[0];
    if (!user) {
        throw new Error(
            email
                ? `No user with email ${email}. Sign in once, then run this again.`
                : `No users yet. Sign in once, then run this again.`,
        );
    }

    const name = `Load test ${rows}`;
    const list = await pool.query<{ id: string }>(
        `insert into lists (user_id, name, description)
         values ($1, $2, $3) returning id`,
        [
            user.id,
            name,
            `${rows} generated applications for trying out sorting, filtering and scrolling.`,
        ],
    );
    const listId = list.rows[0].id;

    // One multi-row insert per batch rather than one statement per row, which
    // at this size is the difference between a second and several minutes.
    const BATCH = 500;
    const today = new Date();

    for (let start = 0; start < rows; start += BATCH) {
        const batch = Math.min(BATCH, rows - start);
        const values: unknown[] = [];
        const tuples: string[] = [];

        for (let index = 0; index < batch; index += 1) {
            const position = start + index;
            const status = pickStatus();
            const shape = pick(PAY_SHAPES);
            const spread = next();
            // A third of the rows carry a single figure rather than a range, and
            // a tenth carry only a note, which is what sinks them in a pay sort.
            const noAmount = next() < 0.1;
            const single = next() < 0.33;
            const min = Math.round(
                shape.min + (shape.max - shape.min) * spread * 0.5,
            );
            const max = Math.round(min + (shape.max - min) * 0.6);

            const appliedDaysAgo = Math.floor(next() * 240);
            const appliedAt =
                status === "not_applied"
                    ? null
                    : new Date(
                          today.getFullYear(),
                          today.getMonth(),
                          today.getDate() - appliedDaysAgo,
                      );

            const row = [
                listId,
                position,
                `${pick(COMPANIES)} ${position}`,
                // A tenth have no role at all, so blanks-last has something to
                // sort, and the rest carry a level for the numeric ordering.
                next() < 0.1 ? null : `${pick(ROLES)}${pick(LEVELS)}`,
                status,
                next() < 0.7
                    ? `https://boards.example.com/jobs/${position}`
                    : null,
                next() < 0.12 ? null : pick(LOCATIONS),
                pick(ARRANGEMENTS),
                next() < 0.35 ? pick(NOTES) : null,
                noAmount ? null : String(min),
                noAmount || single ? null : String(max),
                shape.currency,
                noAmount ? null : shape.period,
                next() < 0.15 ? String(Math.round(min * 0.1)) : null,
                noAmount ? pick(PAY_NOTES) : null,
                appliedAt,
            ];

            const base = values.length;
            tuples.push(
                `(${row.map((_, offset) => `$${base + offset + 1}`).join(", ")})`,
            );
            values.push(...row);
        }

        await pool.query(
            `insert into applications (
                list_id, position, company_name, role_title, status, url,
                location, arrangement, notes, pay_min, pay_max, pay_currency,
                pay_period, bonus_amount, pay_note, applied_at
             ) values ${tuples.join(", ")}`,
            values,
        );
    }

    // A status trail for a share of the rows, so the flow chart has paths to
    // draw and the detail panel has steps to take back.
    await pool.query(
        `insert into application_events (application_id, from_status, to_status, occurred_at)
         select a.id, 'applied'::application_status, a.status,
                now() - (random() * interval '90 days')
         from applications a
         where a.list_id = $1
            and a.status not in ('not_applied', 'applied')`,
        [listId],
    );

    const count = await pool.query<{ total: number }>(
        `select count(*)::int as total from applications where list_id = $1`,
        [listId],
    );

    console.log(
        `Seeded "${name}" with ${count.rows[0].total} applications for ${user.email}.`,
    );
    await pool.end();
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
