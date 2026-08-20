import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const recordMetricsQuery = `-- name: RecordMetrics :exec
insert into metrics (day, metric, bucket, count, total)
select
    current_date,
    record.metric,
    buckets.bucket,
    counts.count,
    totals.total
from unnest($1::text[]) with ordinality as record (metric, at)
join unnest($2::text[]) with ordinality as buckets (bucket, at)
    on buckets.at = record.at
join unnest($3::bigint[]) with ordinality as counts (count, at)
    on counts.at = record.at
join unnest($4::bigint[]) with ordinality as totals (total, at)
    on totals.at = record.at
on conflict (day, metric, bucket) do update
set count = metrics.count + excluded.count,
    total = metrics.total + excluded.total`;

export interface RecordMetricsArgs {
    metrics: string[];
    buckets: string[];
    counts: string[];
    totals: string[];
}

export async function recordMetrics(client: Client, args: RecordMetricsArgs): Promise<void> {
    await client.query({
        text: recordMetricsQuery,
        values: [args.metrics, args.buckets, args.counts, args.totals],
        rowMode: "array"
    });
}

export const metricTotalsQuery = `-- name: MetricTotals :many
select
    metric,
    bucket,
    -- Summed as bigint, not int. These add up every day the app has ever run
    -- and never come back down, so a total that fits today is not the test. An
    -- int would raise "integer out of range" and take the whole report with it.
    sum(count)::bigint as count,
    sum(total)::bigint as total
from metrics
group by metric, bucket
order by metric, bucket`;

export interface MetricTotalsRow {
    metric: string;
    bucket: string;
    count: string;
    total: string;
}

export async function metricTotals(client: Client): Promise<MetricTotalsRow[]> {
    const result = await client.query({
        text: metricTotalsQuery,
        values: [],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            metric: row[0],
            bucket: row[1],
            count: row[2],
            total: row[3]
        };
    });
}

export const recentMetricTotalsQuery = `-- name: RecentMetricTotals :many
select
    metric,
    bucket,
    -- Summed as bigint, not int. These add up every day the app has ever run
    -- and never come back down, so a total that fits today is not the test. An
    -- int would raise "integer out of range" and take the whole report with it.
    sum(count)::bigint as count,
    sum(total)::bigint as total
from metrics
where day > current_date - $1::int
group by metric, bucket
order by metric, bucket`;

export interface RecentMetricTotalsArgs {
    days: number;
}

export interface RecentMetricTotalsRow {
    metric: string;
    bucket: string;
    count: string;
    total: string;
}

export async function recentMetricTotals(client: Client, args: RecentMetricTotalsArgs): Promise<RecentMetricTotalsRow[]> {
    const result = await client.query({
        text: recentMetricTotalsQuery,
        values: [args.days],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            metric: row[0],
            bucket: row[1],
            count: row[2],
            total: row[3]
        };
    });
}

export const corpusStatsQuery = `-- name: CorpusStats :one
with interviewed as (
    select id
    from applications
    where status = any($1::application_status[])
    union
    select application_id
    from application_events
    where to_status = any($1::application_status[])
),
offered as (
    select id
    from applications
    where status = any($2::application_status[])
    union
    select application_id
    from application_events
    where to_status = any($2::application_status[])
)
select
    (select count(*) from applications)::int as applications,
    (select count(distinct lower(company_name)) from applications)::int
        as companies,
    (select count(*) from interviewed)::int as interviewed,
    (select count(*) from offered)::int as offered`;

export interface CorpusStatsArgs {
    interviewStatuses: string[];
    offerStatuses: string[];
}

export interface CorpusStatsRow {
    applications: number;
    companies: number;
    interviewed: number;
    offered: number;
}

export async function corpusStats(client: Client, args: CorpusStatsArgs): Promise<CorpusStatsRow | null> {
    const result = await client.query({
        text: corpusStatsQuery,
        values: [args.interviewStatuses, args.offerStatuses],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        applications: row[0],
        companies: row[1],
        interviewed: row[2],
        offered: row[3]
    };
}

