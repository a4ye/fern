-- migrate:up
-- One row per user/provider scope makes the fallback budget atomic across every
-- application instance without growing a request log indefinitely.
create table "job_import_rate_limits" (
    "scope_key"         text primary key,
    "window_started_at" timestamptz not null,
    "request_count"     integer not null check ("request_count" > 0)
);

-- Successful provider reads are shared by all users. The URL is normalized
-- before it reaches this table so tracking parameters do not split the cache.
create table "job_import_cache" (
    "url"        text primary key,
    "posting"    jsonb not null,
    "fetched_at" timestamptz not null default now()
);

create index "job_import_cache_fetched_at_idx"
    on "job_import_cache" ("fetched_at");

-- migrate:down
drop table "job_import_cache";
drop table "job_import_rate_limits";
