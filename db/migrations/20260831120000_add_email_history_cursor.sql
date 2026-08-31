-- migrate:up
alter table email_sync_state
add column history_id text;

-- Message IDs are the durable hand-off between Gmail discovery and model
-- processing. Keeping processed rows for a while also prevents a bounded
-- recovery scan from paying to classify the same irrelevant message again.
create table email_sync_messages (
    user_id       text not null references "user" (id) on delete cascade,
    message_id    text not null,
    discovered_at timestamptz not null default now(),
    processed_at  timestamptz,

    primary key (user_id, message_id)
);

create index email_sync_messages_pending_idx
    on email_sync_messages (user_id, discovered_at)
    where processed_at is null;

-- migrate:down
drop table email_sync_messages;

alter table email_sync_state
drop column history_id;
