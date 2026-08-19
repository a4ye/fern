-- migrate:up

-- The table was always a plain window counter keyed by scope; job imports
-- simply used it first. Every rate limit the app enforces now shares it, so it
-- takes the name of what it does.
alter table "job_import_rate_limits" rename to "rate_limits";
alter index "job_import_rate_limits_pkey" rename to "rate_limits_pkey";

-- Unchanged apart from the table it names. See the migration that added it for
-- why the two budgets are taken together under advisory locks.
create or replace function take_job_import_budgets(
    p_user_scope_key text,
    p_provider_scope_key text,
    p_provider_request_cost integer,
    p_window_seconds integer,
    p_user_request_limit integer,
    p_provider_request_limit integer
) returns boolean as $$
declare
    user_count integer;
    provider_count integer;
    user_lock bigint := hashtextextended(p_user_scope_key, 0);
    provider_lock bigint := hashtextextended(p_provider_scope_key, 0);
begin
    perform pg_advisory_xact_lock(least(user_lock, provider_lock));
    perform pg_advisory_xact_lock(greatest(user_lock, provider_lock));

    begin
        insert into rate_limits (scope_key, window_started_at, request_count)
        values (p_user_scope_key, current_timestamp, 1)
        on conflict (scope_key) do update
        set
            window_started_at = case
                when rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then current_timestamp
                else rate_limits.window_started_at
            end,
            request_count = case
                when rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then 1
                else rate_limits.request_count + 1
            end
        where rate_limits.window_started_at
                <= current_timestamp
                    - (p_window_seconds * interval '1 second')
            or rate_limits.request_count + 1 <= p_user_request_limit
        returning request_count into user_count;

        if user_count is null then
            return false;
        end if;

        insert into rate_limits (scope_key, window_started_at, request_count)
        values (
            p_provider_scope_key,
            current_timestamp,
            p_provider_request_cost
        )
        on conflict (scope_key) do update
        set
            window_started_at = case
                when rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then current_timestamp
                else rate_limits.window_started_at
            end,
            request_count = case
                when rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then p_provider_request_cost
                else rate_limits.request_count + p_provider_request_cost
            end
        where rate_limits.window_started_at
                <= current_timestamp
                    - (p_window_seconds * interval '1 second')
            or rate_limits.request_count + p_provider_request_cost
                <= p_provider_request_limit
        returning request_count into provider_count;

        if provider_count is null then
            raise exception 'provider import budget exhausted'
                using errcode = 'P0001';
        end if;

        return true;
    exception when sqlstate 'P0001' then
        return false;
    end;
end;
$$ language plpgsql;

-- better-auth's own limiter, which guards sign-in and the OAuth callbacks: the
-- only endpoints reachable without a session. It counts in memory by default,
-- which on serverless means per instance and so barely at all, so the count
-- lives here instead. The column names are better-auth's to choose and match
-- the camelCase of the other tables it owns.
create table "rate_limit" (
    "id"          text primary key,
    "key"         text not null unique,
    "count"       integer not null,
    "lastRequest" bigint not null
);

create index "rate_limit_lastRequest_idx" on "rate_limit" ("lastRequest");

-- migrate:down
drop table "rate_limit";
alter index "rate_limits_pkey" rename to "job_import_rate_limits_pkey";
alter table "rate_limits" rename to "job_import_rate_limits";

create or replace function take_job_import_budgets(
    p_user_scope_key text,
    p_provider_scope_key text,
    p_provider_request_cost integer,
    p_window_seconds integer,
    p_user_request_limit integer,
    p_provider_request_limit integer
) returns boolean as $$
declare
    user_count integer;
    provider_count integer;
    user_lock bigint := hashtextextended(p_user_scope_key, 0);
    provider_lock bigint := hashtextextended(p_provider_scope_key, 0);
begin
    perform pg_advisory_xact_lock(least(user_lock, provider_lock));
    perform pg_advisory_xact_lock(greatest(user_lock, provider_lock));

    begin
        insert into job_import_rate_limits (
            scope_key,
            window_started_at,
            request_count
        )
        values (p_user_scope_key, current_timestamp, 1)
        on conflict (scope_key) do update
        set
            window_started_at = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then current_timestamp
                else job_import_rate_limits.window_started_at
            end,
            request_count = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then 1
                else job_import_rate_limits.request_count + 1
            end
        where job_import_rate_limits.window_started_at
                <= current_timestamp
                    - (p_window_seconds * interval '1 second')
            or job_import_rate_limits.request_count + 1
                <= p_user_request_limit
        returning request_count into user_count;

        if user_count is null then
            return false;
        end if;

        insert into job_import_rate_limits (
            scope_key,
            window_started_at,
            request_count
        )
        values (
            p_provider_scope_key,
            current_timestamp,
            p_provider_request_cost
        )
        on conflict (scope_key) do update
        set
            window_started_at = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then current_timestamp
                else job_import_rate_limits.window_started_at
            end,
            request_count = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then p_provider_request_cost
                else job_import_rate_limits.request_count
                    + p_provider_request_cost
            end
        where job_import_rate_limits.window_started_at
                <= current_timestamp
                    - (p_window_seconds * interval '1 second')
            or job_import_rate_limits.request_count
                + p_provider_request_cost <= p_provider_request_limit
        returning request_count into provider_count;

        if provider_count is null then
            raise exception 'provider import budget exhausted'
                using errcode = 'P0001';
        end if;

        return true;
    exception when sqlstate 'P0001' then
        return false;
    end;
end;
$$ language plpgsql;
