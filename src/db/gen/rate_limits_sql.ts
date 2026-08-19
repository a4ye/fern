import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const takeRateLimitQuery = `-- name: TakeRateLimit :one
insert into rate_limits (scope_key, window_started_at, request_count)
values ($1, current_timestamp, $2::int)
on conflict (scope_key) do update
set
    window_started_at = case
        when rate_limits.window_started_at
            <= current_timestamp
                - ($3::int * interval '1 second')
        then current_timestamp
        else rate_limits.window_started_at
    end,
    request_count = case
        when rate_limits.window_started_at
            <= current_timestamp
                - ($3::int * interval '1 second')
        then $2::int
        else rate_limits.request_count + $2::int
    end
where rate_limits.window_started_at
        <= current_timestamp
            - ($3::int * interval '1 second')
    or rate_limits.request_count + $2::int
        <= $4::int
returning request_count`;

export interface TakeRateLimitArgs {
    scopeKey: string;
    requestCost: number;
    windowSeconds: number;
    requestLimit: number;
}

export interface TakeRateLimitRow {
    requestCount: number;
}

export async function takeRateLimit(client: Client, args: TakeRateLimitArgs): Promise<TakeRateLimitRow | null> {
    const result = await client.query({
        text: takeRateLimitQuery,
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

