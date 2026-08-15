import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getCachedJobImportQuery = `-- name: GetCachedJobImport :one
select posting
from job_import_cache
where url = $1
    and fetched_at > current_timestamp - interval '12 hours'`;

export interface GetCachedJobImportArgs {
    url: string;
}

export interface GetCachedJobImportRow {
    posting: any;
}

export async function getCachedJobImport(client: Client, args: GetCachedJobImportArgs): Promise<GetCachedJobImportRow | null> {
    const result = await client.query({
        text: getCachedJobImportQuery,
        values: [args.url],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        posting: row[0]
    };
}

export const putCachedJobImportQuery = `-- name: PutCachedJobImport :exec
insert into job_import_cache (url, posting)
values ($1, $2::jsonb)
on conflict (url) do update
set posting = excluded.posting,
    fetched_at = excluded.fetched_at`;

export interface PutCachedJobImportArgs {
    url: string;
    postingJson: any;
}

export async function putCachedJobImport(client: Client, args: PutCachedJobImportArgs): Promise<void> {
    await client.query({
        text: putCachedJobImportQuery,
        values: [args.url, args.postingJson],
        rowMode: "array"
    });
}

export const takeJobImportBudgetQuery = `-- name: TakeJobImportBudget :one
insert into job_import_rate_limits (
    scope_key,
    window_started_at,
    request_count
)
values (
    $1,
    current_timestamp,
    $2::int
)
on conflict (scope_key) do update
set window_started_at = case
        when job_import_rate_limits.window_started_at
            <= current_timestamp - ($3::int * interval '1 second')
        then current_timestamp
        else job_import_rate_limits.window_started_at
    end,
    request_count = case
        when job_import_rate_limits.window_started_at
            <= current_timestamp - ($3::int * interval '1 second')
        then $2::int
        else job_import_rate_limits.request_count + $2::int
    end
where job_import_rate_limits.window_started_at
        <= current_timestamp - ($3::int * interval '1 second')
    or job_import_rate_limits.request_count + $2::int
        <= $4::int
returning request_count`;

export interface TakeJobImportBudgetArgs {
    scopeKey: string;
    requestCost: number;
    windowSeconds: number;
    requestLimit: number;
}

export interface TakeJobImportBudgetRow {
    requestCount: number;
}

export async function takeJobImportBudget(client: Client, args: TakeJobImportBudgetArgs): Promise<TakeJobImportBudgetRow | null> {
    const result = await client.query({
        text: takeJobImportBudgetQuery,
        values: [args.scopeKey, args.requestCost, args.windowSeconds, args.requestLimit],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        requestCount: row[0]
    };
}

