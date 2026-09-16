-- migrate:up

-- A friendship is one row for the pair, not one per direction. `requester_id`
-- and `addressee_id` record who asked, which is what lets the two sides of a
-- pending request be told apart; once accepted the pair is symmetric and every
-- read has to look at both columns.
create type friendship_status as enum ('pending', 'accepted');

create table "friendships" (
    "id"           uuid primary key default gen_random_uuid(),
    "requester_id" text not null references "user" ("id") on delete cascade,
    "addressee_id" text not null references "user" ("id") on delete cascade,
    "status"       friendship_status not null default 'pending',
    "created_at"   timestamptz not null default now(),
    "accepted_at"  timestamptz,

    constraint "friendships_not_self"
        check ("requester_id" <> "addressee_id")
);

-- One row per pair whichever way round it was created, so two people who ask
-- each other at the same time cannot end up as friends twice. Expression
-- indexes are how the pair is made order-independent, since a plain unique
-- constraint would see (a, b) and (b, a) as different rows.
create unique index "friendships_pair_idx" on "friendships" (
    least("requester_id", "addressee_id"),
    greatest("requester_id", "addressee_id")
);

-- Both directions are read: the requests waiting on you, the ones you sent, and
-- the accepted rows that are your friends whichever column you are in.
create index "friendships_requester_idx"
    on "friendships" ("requester_id", "status");
create index "friendships_addressee_idx"
    on "friendships" ("addressee_id", "status");

-- Who a list is shared with by name. 'friends' means everyone the owner is
-- friends with, evaluated when the list is read rather than when it was shared,
-- so a friend added next month is covered and one removed loses it.
create type share_audience as enum ('friends', 'person');

create table "list_shares" (
    "id"         uuid primary key default gen_random_uuid(),
    "list_id"    uuid not null references "lists" ("id") on delete cascade,
    "audience"   share_audience not null,
    -- Set for 'person' and null for 'friends'. The check keeps the two from
    -- drifting apart, since a person row without a person is not a grant and a
    -- friends row with one would silently narrow it.
    "grantee_id" text references "user" ("id") on delete cascade,
    "created_at" timestamptz not null default now(),

    constraint "list_shares_grantee_matches_audience"
        check (("audience" = 'person') = ("grantee_id" is not null))
);

create unique index "list_shares_person_idx"
    on "list_shares" ("list_id", "grantee_id")
    where "grantee_id" is not null;

create unique index "list_shares_friends_idx"
    on "list_shares" ("list_id")
    where "audience" = 'friends';

-- What a shared list is read through, so the grantee's dashboard can list them.
create index "list_shares_grantee_lookup_idx"
    on "list_shares" ("grantee_id")
    where "grantee_id" is not null;

-- A link anybody holding it can open. The token is the whole of the
-- authorisation, so it is 32 bytes of randomness and is never guessed; it is
-- stored as written rather than hashed because it guards rows sitting in this
-- same database, so a hash would defend the key against an attacker who already
-- has the lock. Keeping it readable is what lets a link be copied again later
-- instead of being shown once and lost.
create table "list_links" (
    "id"             uuid primary key default gen_random_uuid(),
    "list_id"        uuid not null references "lists" ("id") on delete cascade,
    "token"          text not null unique,
    -- Null means the link does not expire. A link that has passed its date is
    -- kept rather than deleted, so the owner can see why it stopped working.
    "expires_at"     timestamptz,
    "revoked_at"     timestamptz,
    "view_count"     integer not null default 0,
    "last_viewed_at" timestamptz,
    "created_at"     timestamptz not null default now()
);

create index "list_links_list_idx"
    on "list_links" ("list_id", "created_at" desc);

-- migrate:down
drop table "list_links";
drop table "list_shares";
drop type share_audience;
drop table "friendships";
drop type friendship_status;
