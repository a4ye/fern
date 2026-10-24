// Scores the "no move back down the funnel" rule in usableMatches against
// every suggestion this app has already put in front of someone, where the
// answer is on record: accepted was right, dismissed was wrong.
//
// A rule that blocks dismissed rows is doing its job. A rule that blocks an
// accepted row is a false negative it has introduced, and the number that
// decides whether it ships.
//
//   bun run scripts/bench-backward.ts

import { getPool } from "../src/db/client";
import { usableMatches } from "../src/lib/email/matches";
import type { ApplicationStatus } from "../src/components/dashboard/data";

const { rows } = await getPool().query<{
    email_subject: string;
    current_status: ApplicationStatus;
    suggested_status: ApplicationStatus;
    state: string;
    company_name: string;
}>(
    `select s.email_subject, s.current_status, s.suggested_status, s.state,
            a.company_name
     from email_suggestions s
     join applications a on a.id = s.application_id
     where s.message_id not like 'seed-%'
     order by s.created_at`,
);

const blocked = (row: (typeof rows)[number]): boolean =>
    usableMatches(
        [
            {
                emailIndex: 0,
                applicationIndex: 0,
                suggestedStatus: row.suggested_status,
                newRound: false,
                confidence: 1,
                reasoning: null,
            },
        ],
        [
            {
                company: row.company_name,
                role: null,
                currentStatus: row.current_status,
                appliedAt: null,
            },
        ],
        [{ subject: row.email_subject }],
    ).length === 0;

const tally = new Map<string, number>();
const examples: string[] = [];

for (const row of rows) {
    const stops = blocked(row);
    const key = `${row.state} / ${stops ? "blocked" : "kept"}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    if (stops) {
        examples.push(
            `  [${row.state}] ${row.current_status} -> ${row.suggested_status}` +
                `  ${row.company_name}: ${row.email_subject.slice(0, 64)}`,
        );
    }
}

console.log(`${rows.length} stored suggestions\n`);
for (const [key, count] of [...tally].sort()) console.log(`${count}\t${key}`);
console.log(`\nblocked rows:`);
for (const line of examples) console.log(line);

await getPool().end();
