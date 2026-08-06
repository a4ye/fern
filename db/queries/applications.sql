-- name: CreateApplication :one
insert into applications (
    list_id, position, company_name, role_title, status, url, location,
    arrangement, applied_at, pay_min, pay_max, pay_currency, pay_period, pay_note
)
select
    l.id,
    coalesce(
        (select max(a.position) + 1 from applications a where a.list_id = l.id),
        0
    ),
    @company_name,
    sqlc.narg('role_title'),
    @status::application_status,
    sqlc.narg('url'),
    sqlc.narg('location'),
    sqlc.narg('arrangement')::work_arrangement,
    sqlc.narg('applied_at')::date,
    sqlc.narg('pay_min')::numeric,
    sqlc.narg('pay_max')::numeric,
    @pay_currency,
    sqlc.narg('pay_period')::pay_period,
    sqlc.narg('pay_note')
from lists l
where l.id = @list_id and l.user_id = @user_id
returning id;

-- name: ListApplicationsForList :many
select
    id,
    company_name,
    role_title,
    status,
    url,
    location,
    arrangement,
    notes,
    pay_min,
    pay_max,
    pay_currency,
    pay_period,
    bonus_amount,
    pay_note,
    applied_at,
    updated_at
from applications
where list_id = $1
order by position asc, created_at asc;

-- name: PipelineForList :many
select status, count(*)::int as count
from applications
where list_id = $1
group by status;

-- name: ApplicationsForUser :many
select
    a.id,
    a.company_name,
    a.role_title,
    a.status,
    l.id as list_id,
    l.name as list_name
from applications a
join lists l on l.id = a.list_id
where l.user_id = @user_id
order by a.updated_at desc;

-- name: GetApplicationForUser :one
select a.id, a.status
from applications a
join lists l on l.id = a.list_id
where a.id = @application_id and l.user_id = @user_id;

-- name: UpdateApplication :exec
update applications a
set
    company_name = @company_name,
    role_title = sqlc.narg('role_title'),
    status = @status::application_status,
    url = sqlc.narg('url'),
    location = sqlc.narg('location'),
    arrangement = sqlc.narg('arrangement')::work_arrangement,
    applied_at = sqlc.narg('applied_at')::date,
    pay_min = sqlc.narg('pay_min')::numeric,
    pay_max = sqlc.narg('pay_max')::numeric,
    pay_currency = @pay_currency,
    pay_period = sqlc.narg('pay_period')::pay_period,
    pay_note = sqlc.narg('pay_note')
from lists l
where a.list_id = l.id
    and a.id = @application_id
    and l.user_id = @user_id;

-- name: DeleteApplication :exec
delete from applications a
using lists l
where a.list_id = l.id
    and a.id = @application_id
    and l.user_id = @user_id;

-- name: DeleteApplications :exec
delete from applications a
using lists l
where a.list_id = l.id
    and a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id;

-- Records the move for every row that is actually changing. Must run before
-- SetApplicationsStatus, which overwrites the status it reads as from_status.
-- name: InsertStatusEvents :exec
insert into application_events (application_id, from_status, to_status)
select a.id, a.status, @status::application_status
from applications a
join lists l on l.id = a.list_id
where a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id
    and a.status <> @status::application_status;

-- name: SetApplicationsStatus :exec
update applications a
set status = @status::application_status
from lists l
where a.list_id = l.id
    and a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id;

-- name: SetApplicationsArrangement :exec
update applications a
set arrangement = sqlc.narg('arrangement')::work_arrangement
from lists l
where a.list_id = l.id
    and a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id;

-- name: SetApplicationStatus :exec
update applications a
set status = @status::application_status
from lists l
where a.list_id = l.id
    and a.id = @application_id
    and l.user_id = @user_id;
