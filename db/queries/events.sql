-- name: RecentEventsForList :many
select
    a.company_name,
    e.from_status,
    e.to_status,
    e.note,
    e.occurred_at
from application_events e
join applications a on a.id = e.application_id
where a.list_id = $1
order by e.occurred_at desc
limit 12;

-- name: StatusEventsForList :many
select e.id, e.application_id, e.from_status, e.to_status, e.occurred_at
from application_events e
join applications a on a.id = e.application_id
where a.list_id = $1
order by e.application_id, e.occurred_at;

-- name: StatusEventsForApplication :many
select e.id, e.from_status, e.to_status, e.occurred_at
from application_events e
join applications a on a.id = e.application_id
join lists l on l.id = a.list_id
where e.application_id = @application_id and l.user_id = @user_id
order by e.occurred_at;

-- name: DeleteApplicationEvent :exec
delete from application_events e
using applications a, lists l
where e.application_id = a.id
    and a.list_id = l.id
    and e.id = @event_id
    and e.application_id = @application_id
    and l.user_id = @user_id;

-- name: InsertApplicationEvent :exec
insert into application_events (application_id, from_status, to_status, note)
values (@application_id, @from_status, @to_status, sqlc.narg('note'));
