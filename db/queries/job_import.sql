-- name: GetCachedJobImport :one
select posting
from job_import_cache
where url = @url
    and fetched_at > current_timestamp - interval '12 hours';

-- name: PutCachedJobImport :exec
with pruned as (
    delete from job_import_cache
    where ctid in (
        select ctid
        from job_import_cache
        where fetched_at <= current_timestamp - interval '7 days'
            and url <> sqlc.arg(url)
        order by fetched_at
        limit 100
    )
)
insert into job_import_cache (url, posting)
values (sqlc.arg(url), sqlc.arg(posting_json)::jsonb)
on conflict (url) do update
set posting = excluded.posting,
    fetched_at = excluded.fetched_at;

-- name: TakeJobImportBudget :one
insert into job_import_rate_limits (
    scope_key,
    window_started_at,
    request_count
)
values (
    sqlc.arg(scope_key),
    current_timestamp,
    sqlc.arg(request_cost)::int
)
on conflict (scope_key) do update
set window_started_at = case
        when job_import_rate_limits.window_started_at
            <= current_timestamp - (sqlc.arg(window_seconds)::int * interval '1 second')
        then current_timestamp
        else job_import_rate_limits.window_started_at
    end,
    request_count = case
        when job_import_rate_limits.window_started_at
            <= current_timestamp - (sqlc.arg(window_seconds)::int * interval '1 second')
        then sqlc.arg(request_cost)::int
        else job_import_rate_limits.request_count + sqlc.arg(request_cost)::int
    end
where job_import_rate_limits.window_started_at
        <= current_timestamp - (sqlc.arg(window_seconds)::int * interval '1 second')
    or job_import_rate_limits.request_count + sqlc.arg(request_cost)::int
        <= sqlc.arg(request_limit)::int
returning request_count;

-- name: TakeJobImportBudgets :one
select take_job_import_budgets(
    sqlc.arg(user_scope_key),
    sqlc.arg(provider_scope_key),
    sqlc.arg(provider_request_cost)::int,
    sqlc.arg(window_seconds)::int,
    sqlc.arg(user_request_limit)::int,
    sqlc.arg(provider_request_limit)::int
) as allowed;
