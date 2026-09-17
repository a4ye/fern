import type { TransactionEvent } from "@sentry/core";

// What counts as worth keeping whole. A request under this is a healthy one and
// says nothing that a slow trace beside it does not say better.
const SLOW_MS = 1_000;

// Enough of the healthy ones to keep a percentile honest. Dropping every fast
// transaction would leave only slow ones behind, and a p95 over those describes
// nothing.
const BASELINE = 0.1;

// A sample rate is applied when a transaction starts, which is before anything
// knows how long it will run, so no rate can be aimed at the slow ones. Sampling
// all of them and deciding here, once the duration is known, is the only way to
// be sure an incident left a trace. Traffic is light enough to afford it.
export const keepSlowTransactions = (
    event: TransactionEvent,
): TransactionEvent | null => {
    const { start_timestamp: started, timestamp: ended } = event;
    if (started === undefined || ended === undefined) return event;

    const slow = (ended - started) * 1000 >= SLOW_MS;
    return slow || Math.random() < BASELINE ? event : null;
};
