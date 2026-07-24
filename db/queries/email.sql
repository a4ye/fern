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

-- name: ListPendingSuggestions :many
select
    s.id,
    s.application_id,
    a.company_name,
    a.role_title,
    l.id as list_id,
    l.name as list_name,
    s.email_from,
    s.email_subject,
    s.email_snippet,
    s.email_received_at,
    s.current_status,
    s.suggested_status,
    s.confidence,
    s.reasoning
from email_suggestions s
join applications a on a.id = s.application_id
join lists l on l.id = a.list_id
where s.user_id = @user_id and s.state = 'pending'
order by s.email_received_at desc;

-- name: GetSuggestionForUser :one
select id, application_id, suggested_status, current_status
from email_suggestions
where id = @id and user_id = @user_id and state = 'pending';

-- name: SetSuggestionState :exec
update email_suggestions
set state = @state::email_suggestion_state
where id = @id and user_id = @user_id;

-- name: CountPendingSuggestions :one
select count(*)::int as total
from email_suggestions
where user_id = @user_id and state = 'pending';

-- name: RecordEmailSync :exec
insert into email_sync_state (user_id, last_synced_at)
values (@user_id, now())
on conflict (user_id) do update set last_synced_at = now();

-- name: GetEmailSyncState :one
select last_synced_at from email_sync_state where user_id = @user_id;
