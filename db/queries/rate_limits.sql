-- Take one request's worth of a budget, and say whether it was there to take.
-- The window restarts the moment it has passed rather than sliding, so a scope
-- that goes quiet is forgiven all at once. No row comes back when the budget is
-- spent, which is the whole answer: the upsert's where clause is what refuses,
-- so counting and deciding happen in the same statement and cannot disagree.
-- name: TakeRateLimit :one
insert into rate_limits (scope_key, window_started_at, request_count)
values (sqlc.arg(scope_key), current_timestamp, sqlc.arg(request_cost)::int)
on conflict (scope_key) do update
set
    window_started_at = case
        when rate_limits.window_started_at
            <= current_timestamp
                - (sqlc.arg(window_seconds)::int * interval '1 second')
        then current_timestamp
        else rate_limits.window_started_at
    end,
    request_count = case
        when rate_limits.window_started_at
            <= current_timestamp
                - (sqlc.arg(window_seconds)::int * interval '1 second')
        then sqlc.arg(request_cost)::int
        else rate_limits.request_count + sqlc.arg(request_cost)::int
    end
where rate_limits.window_started_at
        <= current_timestamp
            - (sqlc.arg(window_seconds)::int * interval '1 second')
    or rate_limits.request_count + sqlc.arg(request_cost)::int
        <= sqlc.arg(request_limit)::int
returning request_count;
