import { getPool } from "@/db/client";
import * as gen from "@/db/gen/metrics_sql";
import {
    INTERVIEWING_STATUSES,
    type ApplicationStatus,
} from "@/components/dashboard/data";
import {
    mergeRecords,
    type MetricRecord,
    type MetricTotal,
} from "@/lib/metrics";

// An offer that was declined or withdrawn was still an offer, so the landing
// page counts it. `OFFER_STATUSES` means something narrower elsewhere: the
// stages a live application can be sitting in.
const OFFER_REACHED: ApplicationStatus[] = [
    "offer_in_progress",
    "offer_accepted",
    "offer_declined",
    "offer_rescinded",
];

// Counting must never cost someone the thing they were doing. A paste that read
// a posting has already succeeded by the time this is called, and a database
// that will not take the count is not a reason to fail the paste, so the error
// stops here. It is the only place in the app that swallows one, and it is
// swallowed because the write is worth less than what it would interrupt.
export const recordMetrics = async (records: MetricRecord[]): Promise<void> => {
    const merged = mergeRecords(records);
    if (merged.length === 0) return;

    try {
        await gen.recordMetrics(getPool(), {
            metrics: merged.map((entry) => entry.metric),
            buckets: merged.map((entry) => entry.bucket),
            // bigint columns travel as text, which is what the driver wants.
            counts: merged.map((entry) => String(Math.round(entry.count))),
            totals: merged.map((entry) => String(Math.round(entry.total))),
        });
    } catch {
        return;
    }
};

// The sums arrive as text, because a bigint does not fit a JS number in the
// general case. These particular ones are counts of things people did, so they
// are nowhere near the 2^53 where that stops being true, and the arithmetic
// above the database is plainer with numbers than with BigInt.
export const readMetricTotals = async (
    days?: number,
): Promise<MetricTotal[]> => {
    const rows =
        days === undefined
            ? await gen.metricTotals(getPool())
            : await gen.recentMetricTotals(getPool(), { days });
    return rows.map((row) => ({
        metric: row.metric,
        bucket: row.bucket,
        count: Number(row.count),
        total: Number(row.total),
    }));
};

export type CorpusStats = {
    applications: number;
    companies: number;
    interviewed: number;
    offered: number;
};

const NO_CORPUS: CorpusStats = {
    applications: 0,
    companies: 0,
    interviewed: 0,
    offered: 0,
};

export const readCorpusStats = async (): Promise<CorpusStats> =>
    (await gen.corpusStats(getPool(), {
        interviewStatuses: INTERVIEWING_STATUSES,
        offerStatuses: OFFER_REACHED,
    })) ?? NO_CORPUS;
