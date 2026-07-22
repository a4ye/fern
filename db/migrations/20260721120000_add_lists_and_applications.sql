-- migrate:up
create type list_status as enum ('active', 'closed', 'archived');

create type work_arrangement as enum ('remote', 'hybrid', 'onsite');

create type pay_period as enum
    ('hourly', 'weekly', 'biweekly', 'monthly', 'yearly', 'one_time');

create type application_status as enum (
    'not_applied',
    'applied',            -- submitted, pending response
    'online_assessment',
    'takehome',
    'interviewing',
    'onsite',
    'offer_in_progress',
    'offer_accepted',
    'offer_declined',     -- offer received, not accepted
    'offer_rescinded',
    'rejected',
    'ghosted',
    'other'
);

create table "lists" (
    "id"          uuid primary key default gen_random_uuid(),
    "user_id"     text not null references "user" ("id") on delete cascade,
    "name"        text not null,
    "description" text,
    "status"      list_status not null default 'active',
    "created_at"  timestamptz not null default now(),
    "updated_at"  timestamptz not null default now()
);

create index "lists_user_id_idx" on "lists" ("user_id");

create table "applications" (
    "id"           uuid primary key default gen_random_uuid(),
    "list_id"      uuid not null references "lists" ("id") on delete cascade,
    "position"     integer not null,
    "company_name" text not null,
    "role_title"   text,
    "status"       application_status not null default 'not_applied',
    "url"          text,
    "location"     text,
    "arrangement"  work_arrangement,
    "notes"        text,

    "pay_min"      numeric(12, 2),
    "pay_max"      numeric(12, 2),
    "pay_currency" char(3) not null default 'USD',   -- ISO 4217
    "pay_period"   pay_period,
    "bonus_amount" numeric(12, 2),
    "pay_note"     text,

    "applied_at"   date,
    "created_at"   timestamptz not null default now(),
    "updated_at"   timestamptz not null default now(),

    constraint "applications_pay_range_check"
        check ("pay_min" is null or "pay_max" is null or "pay_max" >= "pay_min")
);

create index "applications_list_id_idx" on "applications" ("list_id");
create index "applications_list_position_idx"
    on "applications" ("list_id", "position");
create index "applications_status_idx" on "applications" ("status");

create table "application_events" (
    "id"             uuid primary key default gen_random_uuid(),
    "application_id" uuid not null
        references "applications" ("id") on delete cascade,
    "from_status"    application_status,
    "to_status"      application_status,
    "note"           text,
    "occurred_at"    timestamptz not null default now()
);

create index "application_events_application_id_idx"
    on "application_events" ("application_id", "occurred_at" desc);

create function set_updated_at() returns trigger as $$
begin
    new."updated_at" = now();
    return new;
end;
$$ language plpgsql;

create trigger "lists_set_updated_at" before update on "lists"
    for each row execute function set_updated_at();

create trigger "applications_set_updated_at" before update on "applications"
    for each row execute function set_updated_at();

create function set_application_position() returns trigger as $$
begin
    if new."position" is null then
        select coalesce(max("position"), -1) + 1 into new."position"
        from "applications" where "list_id" = new."list_id";
    end if;
    return new;
end;
$$ language plpgsql;

create trigger "applications_set_position" before insert on "applications"
    for each row execute function set_application_position();

-- migrate:down
drop table "application_events";
drop table "applications";
drop table "lists";
drop function set_application_position();
drop function set_updated_at();
drop type application_status;
drop type pay_period;
drop type work_arrangement;
drop type list_status;
