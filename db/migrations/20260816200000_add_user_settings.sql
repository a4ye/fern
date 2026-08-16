-- migrate:up

-- Per-user preferences, one row per user, written the first time a preference
-- is changed. A user with no row is a user who has changed nothing, so reads
-- fall back to the same defaults the columns carry.
create table "user_settings" (
    "user_id"          text primary key
        references "user" ("id") on delete cascade,
    -- ISO 4217, matching applications.pay_currency.
    "default_currency" char(3) not null default 'USD',
    "updated_at"       timestamptz not null default now()
);

-- migrate:down
drop table "user_settings";
