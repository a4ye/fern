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

-- name: InsertApplicationEvent :exec
insert into application_events (application_id, from_status, to_status, note)
values (@application_id, @from_status, @to_status, sqlc.narg('note'));
