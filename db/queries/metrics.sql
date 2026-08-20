-- Records arrive as parallel arrays so one save is one statement whatever it
-- carries: a paste records two, an inbox sync records three. The caller adds up
-- repeats before sending, because `on conflict` may not touch the same row twice
-- in one statement.
-- name: RecordMetrics :exec
insert into metrics (day, metric, bucket, count, total)
select
    current_date,
    record.metric,
    buckets.bucket,
    counts.count,
    totals.total
from unnest(sqlc.arg(metrics)::text[]) with ordinality as record (metric, at)
join unnest(sqlc.arg(buckets)::text[]) with ordinality as buckets (bucket, at)
    on buckets.at = record.at
join unnest(sqlc.arg(counts)::bigint[]) with ordinality as counts (count, at)
    on counts.at = record.at
join unnest(sqlc.arg(totals)::bigint[]) with ordinality as totals (total, at)
    on totals.at = record.at
on conflict (day, metric, bucket) do update
set count = metrics.count + excluded.count,
    total = metrics.total + excluded.total;

-- Every bucket of every metric since the app started counting. Small enough to
-- read whole, which keeps the arithmetic in one place instead of spreading a
-- rate across two queries that could drift apart.
-- name: MetricTotals :many
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
order by metric, bucket;

-- The same, limited to recent days, for a report that wants to say what the app
-- is doing now rather than what it has done in total.
-- name: RecentMetricTotals :many
select
    metric,
    bucket,
    -- Summed as bigint, not int. These add up every day the app has ever run
    -- and never come back down, so a total that fits today is not the test. An
    -- int would raise "integer out of range" and take the whole report with it.
    sum(count)::bigint as count,
    sum(total)::bigint as total
from metrics
where day > current_date - sqlc.arg(days)::int
group by metric, bucket
order by metric, bucket;

-- What the tracker holds, for the public counters on the landing page. An
-- application counts as having reached a stage if it is there now or if it
-- recorded a move into it, since a row that was rejected after an onsite still
-- had the onsite. Nothing here is grouped by account, so no single user is
-- visible in any of it.
-- name: CorpusStats :one
with interviewed as (
    select id
    from applications
    where status = any(sqlc.arg(interview_statuses)::application_status[])
    union
    select application_id
    from application_events
    where to_status = any(sqlc.arg(interview_statuses)::application_status[])
),
offered as (
    select id
    from applications
    where status = any(sqlc.arg(offer_statuses)::application_status[])
    union
    select application_id
    from application_events
    where to_status = any(sqlc.arg(offer_statuses)::application_status[])
)
select
    (select count(*) from applications)::int as applications,
    (select count(distinct lower(company_name)) from applications)::int
        as companies,
    (select count(*) from interviewed)::int as interviewed,
    (select count(*) from offered)::int as offered;
