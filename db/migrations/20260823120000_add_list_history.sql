-- migrate:up
-- One row represents one user intent, even when that intent changes thousands
-- of applications. Automatic maintenance moves older rows into compressed
-- chunks, keeping the hot table and its index bounded.
create sequence list_history_action_id_seq as bigint;

create table list_history_actions (
    id bigint primary key default nextval('list_history_action_id_seq'),
    list_id uuid not null references lists (id) on delete cascade,
    kind smallint not null,
    affected_count integer not null default 1,
    data jsonb not null default '{}'::jsonb,
    reversible boolean not null default true,
    occurred_at timestamptz not null default now(),
    undone_at timestamptz,
    undone_by_action_id bigint,

    constraint list_history_actions_affected_count_check
        check (affected_count >= 0),
    constraint list_history_actions_kind_check check (kind between 1 and 9)
);

create index list_history_actions_list_id_id_idx
    on list_history_actions (list_id, id desc);

-- first_action_id is unique across all actions and therefore doubles as the
-- chunk's primary key. This avoids spending another sequence and eight bytes
-- per archive row on an identifier that would never be used.
create table list_history_archives (
    first_action_id bigint primary key,
    list_id uuid not null references lists (id) on delete cascade,
    last_action_id bigint not null,
    first_occurred_at timestamptz not null,
    last_occurred_at timestamptz not null,
    action_count integer not null,
    payload bytea not null,
    created_at timestamptz not null default now(),

    constraint list_history_archives_action_count_check
        check (action_count > 0),
    constraint list_history_archives_id_order_check
        check (last_action_id >= first_action_id)
);

create index list_history_archives_list_id_last_id_idx
    on list_history_archives (list_id, last_action_id desc);

-- Imports and single creates keep only this eight-byte marker. It lets one
-- history action find every row it created without copying thousands of UUIDs
-- into JSON. It deliberately has no separate index: undo is already scoped by
-- the list_id index and a list is bounded in size.
alter table applications
    add column created_by_history_action_id bigint;

-- Status events use the same marker so undo can remove exactly the events made
-- by an action without storing another UUID array in its payload.
alter table application_events
    add column history_action_id bigint;

-- migrate:down
alter table application_events drop column history_action_id;
alter table applications drop column created_by_history_action_id;
drop table list_history_archives;
drop table list_history_actions;
drop sequence list_history_action_id_seq;
