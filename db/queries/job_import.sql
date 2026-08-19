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

-- name: TakeJobImportBudgets :one
select take_job_import_budgets(
    sqlc.arg(user_scope_key),
    sqlc.arg(provider_scope_key),
    sqlc.arg(provider_request_cost)::int,
    sqlc.arg(window_seconds)::int,
    sqlc.arg(user_request_limit)::int,
    sqlc.arg(provider_request_limit)::int
) as allowed;
