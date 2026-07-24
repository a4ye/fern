-- migrate:up
create type email_suggestion_state as enum ('pending', 'accepted', 'dismissed');

-- A proposed status change detected from a connected inbox, awaiting review.
-- Each row ties one email to one application; the user accepts or dismisses it.
create table "email_suggestions" (
    "id"               uuid primary key default gen_random_uuid(),
    "user_id"          text not null references "user" ("id") on delete cascade,
    "application_id"   uuid not null
        references "applications" ("id") on delete cascade,
    "message_id"       text not null,
    "email_from"       text not null,
    "email_subject"    text not null,
    "email_snippet"    text not null,
    "email_received_at" timestamptz not null,
    "current_status"   application_status not null,
    "suggested_status" application_status not null,
    "confidence"       real not null,
    "reasoning"        text,
    "state"            email_suggestion_state not null default 'pending',
    "created_at"       timestamptz not null default now(),

    -- One email maps to at most one suggestion per application, so re-syncing
    -- the same inbox never duplicates a pending review.
    constraint "email_suggestions_message_application_key"
        unique ("application_id", "message_id")
);

create index "email_suggestions_user_state_idx"
    on "email_suggestions" ("user_id", "state", "created_at" desc);

-- Tracks when a user last pulled their inbox, for display and future
-- incremental syncs. One row per user.
create table "email_sync_state" (
    "user_id"        text primary key references "user" ("id") on delete cascade,
    "last_synced_at" timestamptz
);

-- migrate:down
drop table "email_sync_state";
drop table "email_suggestions";
drop type email_suggestion_state;
