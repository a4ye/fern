"use server";

import { after } from "next/server";
import { getRequestSession, getViewAs } from "@/lib/auth";
import { recordMetrics } from "@/db/metrics";
import { withinBudget } from "@/db/rate-limit";
import {
    POSTING_ATTEMPT,
    POSTING_FIELDS,
    POSTING_READ,
    POSTING_SOURCE,
    record,
    type PostingReadReport,
} from "@/lib/metrics";
import { postingReadSchema } from "@/lib/validation";

// A paste is offered to three readers and only one of them is here, so the
// browser is the only witness to the whole attempt. It reports once, after it
// knows which reader won, and nothing it sends is stored verbatim: every bucket
// name is chosen here out of a closed set, so a caller cannot name a row of its
// own or write an employer's domain into this table.
//
// The form does not wait on this and neither does the response: the count is
// written once the reply is on its way, because a report that is waited on costs
// the user their turn and a report that never arrives costs only a number.
export const recordPostingRead = async (
    report: PostingReadReport,
): Promise<void> => {
    const session = await getRequestSession();
    if (!session || (await getViewAs())) return;
    if (!(await withinBudget(session.user.id, "metrics"))) return;

    const parsed = postingReadSchema.safeParse(report);
    if (!parsed.success) return;

    const read = parsed.data;
    after(() =>
        recordMetrics([
            record(POSTING_READ, read.outcome, { total: read.waitedMs }),
            // Every reader the link reached, which is what makes the line above
            // a hit rate rather than a popularity contest.
            ...read.attempted.map((reader) => record(POSTING_ATTEMPT, reader)),
            // Only a read that filled something has a source or fields to
            // count, and their bucket is the reader rather than the outcome,
            // since those are the same thing once something was found.
            ...(read.fieldsFilled > 0
                ? [
                      record(POSTING_FIELDS, read.outcome, {
                          total: read.fieldsFilled,
                      }),
                  ]
                : []),
            ...(read.source ? [record(POSTING_SOURCE, read.source)] : []),
        ]),
    );
};
