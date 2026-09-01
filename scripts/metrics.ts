// Prints what the app has done, out of the rollup counters and the tracker
// itself. These are the numbers page analytics cannot see: whether a pasted link
// filled the form in, which of the three readers got there first, whether the
// status change the model proposed was one anybody took.
//
//   bun run metrics          # everything since counting began
//   bun run metrics 30       # the last 30 days

import { readCorpusStats, readMetricTotals } from "../src/db/metrics";
import {
    summarize,
    type MetricSummary,
    type PostingReader,
} from "../src/lib/metrics";
import type { PostingSource } from "../src/lib/job-import/shared";
import type { CorpusStats } from "../src/db/metrics";

const NUMBER = new Intl.NumberFormat("en-US");

const days = process.argv[2] ? Number(process.argv[2]) : undefined;
if (days !== undefined && (!Number.isInteger(days) || days < 1)) {
    throw new Error(`Give a whole number of days, not "${process.argv[2]}".`);
}

// A figure nobody has the evidence for prints as a dash. Rendering an unmeasured
// rate as "0%" would read as a failure rather than as a silence.
const NONE = "-";

const count = (value: number) => NUMBER.format(value);

const share = (part: number, whole: number) =>
    whole > 0 ? part / whole : null;

const READER_LABEL: Record<PostingReader, string> = {
    browser: "In the page",
    extension: "By the extension",
    server: "By this server",
};

const SOURCE_LABEL: Record<PostingSource, string> = {
    greenhouse: "Greenhouse",
    lever: "Lever",
    ashby: "Ashby",
    simplify: "Simplify",
    rippling: "Rippling",
    // Not boards. These two are the generic page formats the extension reads
    // when the site is an employer's own careers page.
    "json-ld": "A page's own JSON-LD",
    opengraph: "A page's own meta tags",
    // The page gave up nothing, and the company name was read off the address.
    none: "The address only",
};

const percent = (value: number | null, part: number, whole: number) =>
    value === null
        ? NONE
        : `${Math.round(value * 100)}%   ${count(part)} of ${count(whole)}`;

const decimal = (value: number | null, places: number, unit = "") =>
    value === null ? NONE : `${value.toFixed(places)}${unit}`;

const LABEL_WIDTH = 28;

const line = (label: string, value: string) =>
    console.log(`  ${label.padEnd(LABEL_WIDTH)}${value}`);

const heading = (title: string) => console.log(`\n${title}`);

const report = (summary: MetricSummary, corpus: CorpusStats) => {
    console.log(
        days === undefined
            ? "\nFern, since counting began"
            : `\nFern, last ${days} days`,
    );

    heading("Reading a posting from a link");
    line("Links read", count(summary.reads));
    line(
        "Filled the form",
        percent(summary.fillRate, summary.filled, summary.reads),
    );
    line(
        "Read without this server",
        percent(summary.offServerShare, summary.offServer, summary.filled),
    );
    line("Fields filled per read", decimal(summary.fieldsPerFill, 1));
    line("Fields filled in total", count(summary.fieldsFilled));
    line("Mean wait", decimal(summary.meanReadMs, 0, "ms"));

    // A link is offered to each reader in turn until one fills the form, so
    // these denominators differ: the browser sees every readable link and the
    // server sees only what the two before it could not manage.
    heading("Each reader, against what it was given");
    for (const reader of summary.readers) {
        line(
            READER_LABEL[reader.reader],
            percent(reader.hitRate, reader.hits, reader.attempts),
        );
    }

    heading("The server's share of that");
    line("Reads reaching this server", count(summary.serverReads));
    line(
        "Answered from cache",
        percent(summary.cacheHitRate, summary.cacheHits, summary.serverReads),
    );

    // Everything above the server's own section is reported by the browser,
    // because two of the three readers run where this server cannot watch them.
    // These two counts are the one place the two sides describe the same event,
    // so they are the only check on whether the reports are honest.
    heading("Do the two sides agree about the server");
    line("The browser says", count(summary.serverReadsClaimed));
    line("The server recorded", count(summary.serverReadsRecorded));

    heading("Where the postings came from");
    if (summary.sources.length === 0) {
        line("Nothing read yet", NONE);
    }
    for (const entry of summary.sources) {
        line(
            SOURCE_LABEL[entry.source],
            percent(
                share(entry.count, summary.filled),
                entry.count,
                summary.filled,
            ),
        );
    }

    heading("Reading an inbox");
    line("Syncs", count(summary.syncs));
    line("Messages classified", count(summary.messagesRead));
    line("Status changes proposed", count(summary.proposed));
    line(
        "Proposals accepted",
        percent(
            summary.acceptanceRate,
            summary.accepted,
            summary.accepted + summary.dismissed,
        ),
    );

    heading("Migrating off a spreadsheet");
    line("Files read", count(summary.sheetsRead));
    line("Imports committed", count(summary.sheetsCommitted));
    line("Rows migrated", count(summary.rowsImported));

    // Counted from the rows themselves rather than from the rollups, so this
    // block is always the whole tracker even when the rest is a window.
    heading("What the tracker holds, in total");
    line("Applications", count(corpus.applications));
    line("Companies", count(corpus.companies));
    line("Reached an interview", count(corpus.interviewed));
    line("Reached an offer", count(corpus.offered));
    console.log("");
};

const [totals, corpus] = await Promise.all([
    readMetricTotals(days),
    readCorpusStats(),
]);
report(summarize(totals), corpus);
process.exit(0);
