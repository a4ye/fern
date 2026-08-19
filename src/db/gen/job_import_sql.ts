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
with pruned as (
    delete from job_import_cache
    where ctid in (
        select ctid
        from job_import_cache
        where fetched_at <= current_timestamp - interval '7 days'
            and url <> $1
        order by fetched_at
        limit 100
    )
)
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

export const takeJobImportBudgetsQuery = `-- name: TakeJobImportBudgets :one
select take_job_import_budgets(
    $1,
    $2,
    $3::int,
    $4::int,
    $5::int,
    $6::int
) as allowed`;

export interface TakeJobImportBudgetsArgs {
    userScopeKey: string;
    providerScopeKey: string;
    providerRequestCost: number;
    windowSeconds: number;
    userRequestLimit: number;
    providerRequestLimit: number;
}

export interface TakeJobImportBudgetsRow {
    allowed: boolean;
}

export async function takeJobImportBudgets(client: Client, args: TakeJobImportBudgetsArgs): Promise<TakeJobImportBudgetsRow | null> {
    const result = await client.query({
        text: takeJobImportBudgetsQuery,
        values: [args.userScopeKey, args.providerScopeKey, args.providerRequestCost, args.windowSeconds, args.userRequestLimit, args.providerRequestLimit],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        allowed: row[0]
    };
}

