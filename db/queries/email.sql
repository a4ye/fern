-- name: InsertEmailSuggestion :one
insert into email_suggestions (
    user_id, application_id, message_id, email_from, email_subject,
    email_snippet, email_received_at, current_status, suggested_status,
    confidence, reasoning
)
select
    @user_id, a.id, @message_id, @email_from, @email_subject,
    @email_snippet, @email_received_at::timestamptz,
    @current_status::application_status, @suggested_status::application_status,
    @confidence::real, sqlc.narg('reasoning')
from applications a
join lists l on l.id = a.list_id
where a.id = @application_id and l.user_id = @user_id
on conflict ("application_id", "message_id") do nothing
returning id;

-- name: InsertEmailSuggestions :many
with eligible as materialized (
    select
        (input.value ->> 'application_id')::uuid as application_id,
        input.value ->> 'message_id' as message_id,
        input.value ->> 'email_from' as email_from,
        input.value ->> 'email_subject' as email_subject,
        input.value ->> 'email_snippet' as email_snippet,
        input.value ->> 'email_received_at' as email_received_at,
        input.value ->> 'current_status' as current_status,
        input.value ->> 'suggested_status' as suggested_status,
        (input.value ->> 'confidence')::real as confidence,
        input.value ->> 'reasoning' as reasoning
    from jsonb_array_elements(@rows::jsonb) as input(value)
    join applications a
        on a.id = (input.value ->> 'application_id')::uuid
    join lists l on l.id = a.list_id
    where l.user_id = @user_id
)
insert into email_suggestions (
    user_id, application_id, message_id, email_from, email_subject,
    email_snippet, email_received_at, current_status, suggested_status,
    confidence, reasoning
)
select
    @user_id,
    eligible.application_id,
    eligible.message_id,
    eligible.email_from,
    eligible.email_subject,
    eligible.email_snippet,
    eligible.email_received_at::timestamptz,
    eligible.current_status::application_status,
    eligible.suggested_status::application_status,
    eligible.confidence,
    eligible.reasoning
from eligible
on conflict ("application_id", "message_id") do nothing
returning id;

-- name: ListPendingSuggestions :many
select
    s.id,
    s.application_id,
    a.company_name,
    a.role_title,
    l.id as list_id,
    l.name as list_name,
    s.message_id,
    s.email_subject,
    s.current_status,
    s.suggested_status
from email_suggestions s
join applications a on a.id = s.application_id
join lists l on l.id = a.list_id
where s.user_id = @user_id and s.state = 'pending'
order by s.email_received_at desc
limit 100;

-- name: GetSuggestionForUser :one
select id, application_id, suggested_status, current_status, email_received_at
from email_suggestions
where id = @id and user_id = @user_id and state = 'pending'
for update;

-- name: SetSuggestionState :exec
update email_suggestions
set state = @state::email_suggestion_state
where id = @id and user_id = @user_id and state = 'pending';

-- name: CountPendingSuggestions :one
select count(*)::int as total
from email_suggestions
where user_id = @user_id and state = 'pending';

-- name: RecordEmailSync :exec
with pruned_suggestions as (
    delete from email_suggestions
    where id in (
        select id
        from email_suggestions
        where state <> 'pending'
            and created_at <= now() - interval '90 days'
        order by created_at
        limit 500
    )
),
pruned_messages as (
    delete from email_sync_messages
    where (user_id, message_id) in (
        select user_id, message_id
        from email_sync_messages
        where processed_at <= now() - interval '90 days'
        order by processed_at
        limit 1000
    )
)
insert into email_sync_state (user_id, last_synced_at)
values (@user_id, now())
on conflict (user_id) do update set last_synced_at = now();

-- name: GetEmailSyncState :one
select last_synced_at, history_id
from email_sync_state
where user_id = @user_id;

-- name: InsertEmailSyncMessages :many
insert into email_sync_messages (user_id, message_id)
select @user_id, input.value
from jsonb_array_elements_text(@message_ids::jsonb) as input(value)
on conflict (user_id, message_id) do nothing
returning message_id;

-- name: SetEmailSyncCursor :exec
insert into email_sync_state (user_id, history_id)
values (@user_id, @history_id)
on conflict (user_id) do update set history_id = excluded.history_id;

-- name: ListPendingEmailSyncMessages :many
-- Newest first. A sync reads a bounded number of messages, so whichever end of
-- the backlog is drained last is the end that waits. Recent mail is where a
-- status change is, and Gmail's message IDs climb with time, which orders the
-- messages a single discovery staged together under one timestamp.
select message_id
from email_sync_messages
where user_id = @user_id and processed_at is null
order by discovered_at desc, message_id desc
limit @row_limit::int;

-- name: MarkEmailSyncMessagesProcessed :exec
update email_sync_messages
set processed_at = now()
where user_id = @user_id
    and processed_at is null
    and message_id in (
        select input.value
        from jsonb_array_elements_text(@message_ids::jsonb) as input(value)
    );

-- name: CountPendingEmailSyncMessages :one
select count(*)::int as total
from email_sync_messages
where user_id = @user_id and processed_at is null;
