import { describe, expect, it } from "bun:test";
import { EMPTY_POSTING } from "@/lib/job-import/shared";
import {
    INBOX_SCAN,
    INBOX_SUGGESTION,
    POSTING_ATTEMPT,
    POSTING_FALLBACK,
    POSTING_FIELDS,
    POSTING_READ,
    POSTING_SOURCE,
    SHEET_IMPORT,
    mergeRecords,
    postingFieldsFilled,
    record,
    summarize,
    type MetricTotal,
} from "@/lib/metrics";

describe("mergeRecords", () => {
    it("adds up repeats of the same bucket", () => {
        expect(
            mergeRecords([
                record(POSTING_READ, "browser", { total: 200 }),
                record(POSTING_READ, "browser", { total: 400 }),
            ]),
        ).toEqual([
            { metric: POSTING_READ, bucket: "browser", count: 2, total: 600 },
        ]);
    });

    it("keeps different buckets of one metric apart", () => {
        const merged = mergeRecords([
            record(POSTING_READ, "browser"),
            record(POSTING_READ, "server"),
        ]);
        expect(merged.map((entry) => entry.bucket)).toEqual([
            "browser",
            "server",
        ]);
    });

    it("drops a record of nothing, so an empty sync writes no row", () => {
        expect(
            mergeRecords([record(INBOX_SUGGESTION, "offered", { count: 0 })]),
        ).toEqual([]);
    });

    it("leaves the records it was given untouched", () => {
        const first = record(POSTING_READ, "browser", { total: 200 });
        mergeRecords([first, record(POSTING_READ, "browser", { total: 400 })]);
        expect(first.total).toBe(200);
    });
});

describe("postingFieldsFilled", () => {
    it("counts nothing for a posting that read nothing", () => {
        expect(postingFieldsFilled(EMPTY_POSTING)).toBe(0);
    });

    it("counts only the five fields the form fills", () => {
        expect(
            postingFieldsFilled({
                company: "Acme",
                role: "Engineer",
                location: "Toronto",
                arrangement: "remote",
                pay: "$120k",
                payNote: null,
                source: "greenhouse",
                // Offered rather than filled in, so it is not one of the five.
                employerUrl: "https://acme.example/jobs/1",
            }),
        ).toBe(5);
    });
});

const totals = (rows: [string, string, number, number][]): MetricTotal[] =>
    rows.map(([metric, bucket, count, total]) => ({
        metric,
        bucket,
        count,
        total,
    }));

describe("summarize", () => {
    it("reports no rate at all when nothing has been counted", () => {
        const summary = summarize([]);
        expect(summary.fillRate).toBeNull();
        expect(summary.acceptanceRate).toBeNull();
        expect(summary.meanReadMs).toBeNull();
        expect(summary.reads).toBe(0);
    });

    it("counts every outcome as a read but only the readers as filled", () => {
        const summary = summarize(
            totals([
                [POSTING_READ, "browser", 6, 1200],
                [POSTING_READ, "extension", 2, 800],
                [POSTING_READ, "server", 2, 2000],
                [POSTING_READ, "missed", 5, 1000],
                [POSTING_READ, "unsupported", 5, 0],
            ]),
        );
        expect(summary.reads).toBe(20);
        expect(summary.filled).toBe(10);
        expect(summary.fillRate).toBe(0.5);
        expect(summary.meanReadMs).toBe(250);
    });

    it("measures the off-server share against the reads that worked", () => {
        const summary = summarize(
            totals([
                [POSTING_READ, "browser", 6, 0],
                [POSTING_READ, "extension", 2, 0],
                [POSTING_READ, "server", 2, 0],
                [POSTING_READ, "missed", 90, 0],
            ]),
        );
        expect(summary.offServer).toBe(8);
        expect(summary.offServerShare).toBe(0.8);
    });

    it("averages fields over the reads that filled them", () => {
        const summary = summarize(
            totals([
                [POSTING_FIELDS, "browser", 3, 15],
                [POSTING_FIELDS, "server", 1, 1],
            ]),
        );
        expect(summary.fieldsFilled).toBe(16);
        expect(summary.fieldsPerFill).toBe(4);
    });

    it("scores each reader against the links it was actually given", () => {
        const summary = summarize(
            totals([
                // Every readable link goes to the page first.
                [POSTING_ATTEMPT, "browser", 10, 0],
                [POSTING_READ, "browser", 8, 0],
                // The extension only sees what the page could not manage.
                [POSTING_ATTEMPT, "extension", 2, 0],
                [POSTING_READ, "extension", 1, 0],
                [POSTING_ATTEMPT, "server", 1, 0],
                [POSTING_READ, "server", 1, 0],
            ]),
        );
        expect(summary.readers).toEqual([
            { reader: "browser", attempts: 10, hits: 8, hitRate: 0.8 },
            { reader: "extension", attempts: 2, hits: 1, hitRate: 0.5 },
            { reader: "server", attempts: 1, hits: 1, hitRate: 1 },
        ]);
    });

    it("has no hit rate for a reader nothing was ever given to", () => {
        const summary = summarize(totals([[POSTING_ATTEMPT, "browser", 3, 0]]));
        const extension = summary.readers.find(
            (entry) => entry.reader === "extension",
        );
        expect(extension).toEqual({
            reader: "extension",
            attempts: 0,
            hits: 0,
            hitRate: null,
        });
    });

    it("ranks the boards postings came from, commonest first", () => {
        const summary = summarize(
            totals([
                [POSTING_SOURCE, "lever", 3, 0],
                [POSTING_SOURCE, "greenhouse", 9, 0],
                [POSTING_SOURCE, "ashby", 5, 0],
            ]),
        );
        expect(summary.sources).toEqual([
            { source: "greenhouse", count: 9 },
            { source: "ashby", count: 5 },
            { source: "lever", count: 3 },
        ]);
    });

    it("leaves out boards nothing came from", () => {
        const summary = summarize(totals([[POSTING_SOURCE, "lever", 1, 0]]));
        expect(summary.sources).toEqual([{ source: "lever", count: 1 }]);
    });

    it("keeps both sides' count of the server, so they can be compared", () => {
        const summary = summarize(
            totals([
                [POSTING_ATTEMPT, "server", 40, 0],
                [POSTING_FALLBACK, "cache", 10, 0],
                [POSTING_FALLBACK, "fetched", 10, 0],
            ]),
        );
        expect(summary.serverReadsClaimed).toBe(40);
        expect(summary.serverReadsRecorded).toBe(20);
    });

    it("measures the cache against the reads that reached the server", () => {
        const summary = summarize(
            totals([
                [POSTING_FALLBACK, "cache", 6, 0],
                [POSTING_FALLBACK, "fetched", 2, 0],
                [POSTING_FALLBACK, "missed", 2, 0],
            ]),
        );
        expect(summary.serverReads).toBe(10);
        expect(summary.cacheHitRate).toBe(0.6);
    });

    it("judges the model on the proposals that were answered", () => {
        const summary = summarize(
            totals([
                [INBOX_SCAN, "read", 4, 100],
                [INBOX_SUGGESTION, "offered", 20, 0],
                [INBOX_SUGGESTION, "accepted", 9, 0],
                [INBOX_SUGGESTION, "dismissed", 1, 0],
            ]),
        );
        expect(summary.syncs).toBe(4);
        expect(summary.messagesRead).toBe(100);
        expect(summary.proposed).toBe(20);
        // The ten still waiting are not evidence either way.
        expect(summary.acceptanceRate).toBe(0.9);
    });

    it("counts migrated rows from the commit and not from the read", () => {
        const summary = summarize(
            totals([
                [SHEET_IMPORT, "read", 3, 900],
                [SHEET_IMPORT, "unreadable", 1, 0],
                [SHEET_IMPORT, "committed", 2, 600],
            ]),
        );
        expect(summary.sheetsRead).toBe(3);
        expect(summary.sheetsCommitted).toBe(2);
        expect(summary.rowsImported).toBe(600);
    });

    it("ignores buckets it does not know, so an old name cannot skew a rate", () => {
        const summary = summarize(
            totals([
                [POSTING_READ, "browser", 1, 100],
                [POSTING_READ, "carrier-pigeon", 9, 900],
            ]),
        );
        expect(summary.filled).toBe(1);
        expect(summary.reads).toBe(10);
    });
});
