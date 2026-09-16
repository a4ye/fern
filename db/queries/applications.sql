-- The status a row is created with is the first step of its history, written
-- here rather than left to the first move: an application that never moves has
-- a trail too, and one created part way along started there. Nothing precedes
-- it, so it is the one event with no from_status.
-- name: CreateApplication :one
with created as (
    insert into applications (
        list_id, position, company_name, role_title, status, url, location,
        arrangement, applied_at, pay_min, pay_max, pay_currency, pay_period,
        bonus_amount, pay_note, notes, created_by_history_action_id
    )
    select
        l.id,
        coalesce(
            (
                select max(a.position) + 1
                from applications a
                where a.list_id = l.id
            ),
            0
        ),
        @company_name,
        sqlc.narg('role_title'),
        @status::application_status,
        sqlc.narg('url'),
        sqlc.narg('location'),
        sqlc.narg('arrangement')::work_arrangement,
        coalesce(
            sqlc.narg('applied_at')::date,
            case
                when @status::application_status = 'applied'
                then (current_timestamp at time zone @time_zone::text)::date
            end
        ),
        sqlc.narg('pay_min')::numeric,
        sqlc.narg('pay_max')::numeric,
        @pay_currency,
        sqlc.narg('pay_period')::pay_period,
        sqlc.narg('bonus_amount')::numeric,
        sqlc.narg('pay_note'),
        sqlc.narg('notes'),
        @history_action_id::bigint
    from lists l
    where l.id = @list_id and l.user_id = @user_id
    returning id, status
),
opening as (
    insert into application_events (
        application_id, from_status, to_status, history_action_id
    )
    select
        created.id,
        null::application_status,
        created.status,
        @history_action_id::bigint
    from created
)
select id from created;

-- A whole spreadsheet in one statement. The same columns CreateApplication
-- writes, read off one JSON parameter rather than one row per round trip: a
-- query per row would hold the transaction open for as long as the network
-- took, times the number of rows.
--
-- `offset` counts 0, 1, 2 up the batch, so every row lands after the ones
-- already in the list and in the order the file wrote them. The insert cannot
-- read its own rows back to work that out, which is also why the position
-- trigger is no help here: within one statement it would hand every row the
-- same number.
--
-- Every field arrives as text and is cast here. A date in particular must not
-- go through the driver as a Date, which is serialized in its own timezone and
-- can land a day either side of midnight; yyyy-mm-dd cast in the database
-- cannot move.
-- name: CreateApplications :many
with created as (
    insert into applications (
        list_id, position, company_name, role_title, status, url, location,
        arrangement, applied_at, pay_min, pay_max, pay_currency, pay_period,
        pay_note, notes, created_by_history_action_id
    )
    select
        l.id,
        coalesce(
            (
                select max(a.position) + 1
                from applications a
                where a.list_id = l.id
            ),
            0
        ) + row.offset,
        row.company_name,
        row.role_title,
        row.status::application_status,
        row.url,
        row.location,
        row.arrangement::work_arrangement,
        coalesce(
            row.applied_at::date,
            case
                when row.status::application_status = 'applied'
                then (current_timestamp at time zone @time_zone::text)::date
            end
        ),
        row.pay_min::numeric,
        row.pay_max::numeric,
        row.pay_currency,
        row.pay_period::pay_period,
        row.pay_note,
        row.notes,
        @history_action_id::bigint
    from lists l
    cross join jsonb_to_recordset(@rows::jsonb) as row(
        "offset" int,
        company_name text,
        role_title text,
        status text,
        url text,
        location text,
        arrangement text,
        applied_at text,
        pay_min text,
        pay_max text,
        pay_currency text,
        pay_period text,
        pay_note text,
        notes text
    )
    where l.id = @list_id and l.user_id = @user_id
    returning id, status
),
opening as (
    insert into application_events (
        application_id, from_status, to_status, history_action_id
    )
    select
        created.id,
        null::application_status,
        created.status,
        @history_action_id::bigint
    from created
)
select id from created;

-- Every column the table draws, and nothing past it. The notes are left out
-- deliberately: they are free text that only the detail panel reads, and a
-- list's worth of them outweighs every other column put together.
-- name: ListApplicationsForList :many
select
    a.id,
    a.company_name,
    a.role_title,
    a.status,
    a.url,
    a.location,
    a.arrangement,
    a.pay_min,
    a.pay_max,
    a.pay_currency,
    a.pay_period,
    a.bonus_amount,
    a.pay_note,
    a.applied_at,
    a.updated_at
from applications a
join lists l on l.id = a.list_id
where a.list_id = sqlc.arg(list_id) and l.user_id = sqlc.arg(user_id)
order by a.created_at desc, a.position desc
-- A roof on what one page load reads, sitting above the number a list is
-- allowed to hold so it trims nothing anyone could have added.
limit sqlc.arg(max_applications)::int;

-- What the detail panel needs and the table does not, read when a single row is
-- opened rather than shipped for all of them.
-- name: ApplicationDetailForUser :one
select a.notes
from applications a
join lists l on l.id = a.list_id
where a.id = @application_id and l.user_id = @user_id;

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
order by a.updated_at desc
limit 2000;

-- name: GetApplicationForUser :one
select a.id, a.status
from applications a
join lists l on l.id = a.list_id
where a.id = @application_id and l.user_id = @user_id
for update of a;

-- Locks a bulk selection in a stable order before its status history and
-- current status are changed together.
-- name: LockApplicationsForUser :many
select a.id
from applications a
join lists l on l.id = a.list_id
where a.id = any(@application_ids::uuid[]) and l.user_id = @user_id
order by a.id
for update of a;

-- A quick-edit batch is locked, updated, and given status-history rows in one
-- statement. JSON keeps the fields for each row together while avoiding a
-- network round trip per application.
-- name: UpdateApplicationsBulk :exec
with locked as materialized (
    select
        a.id,
        a.status as old_status,
        input.value ->> 'company_name' as company_name,
        input.value ->> 'role_title' as role_title,
        input.value ->> 'status' as status,
        input.value ->> 'url' as url,
        input.value ->> 'location' as location,
        input.value ->> 'arrangement' as arrangement,
        input.value ->> 'applied_at' as applied_at,
        (input.value ->> 'pay_typed')::boolean as pay_typed,
        input.value ->> 'pay_min' as pay_min,
        input.value ->> 'pay_max' as pay_max,
        input.value ->> 'pay_currency' as pay_currency,
        input.value ->> 'pay_period' as pay_period,
        input.value ->> 'pay_note' as pay_note
    from applications a
    join lists l on l.id = a.list_id
    join jsonb_array_elements(@rows::jsonb) as input(value)
        on (input.value ->> 'id')::uuid = a.id
    where l.user_id = @user_id
    order by a.id
    for update of a
),
updated as (
    update applications a
    set
        company_name = row.company_name,
        role_title = row.role_title,
        status = row.status::application_status,
        url = row.url,
        location = row.location,
        arrangement = row.arrangement::work_arrangement,
        applied_at = case
            when a.applied_at is null
                and a.status <> 'applied'
                and row.status::application_status = 'applied'
                and row.applied_at::date is null
            then (current_timestamp at time zone @time_zone::text)::date
            else row.applied_at::date
        end,
        pay_min = case
            when row.pay_typed then row.pay_min::numeric else a.pay_min
        end,
        pay_max = case
            when row.pay_typed then row.pay_max::numeric else a.pay_max
        end,
        pay_currency = case
            when row.pay_typed then row.pay_currency else a.pay_currency
        end,
        pay_period = case
            when row.pay_typed then row.pay_period::pay_period else a.pay_period
        end,
        pay_note = case
            when row.pay_typed then row.pay_note else a.pay_note
        end
    from locked row
    where a.id = row.id
    returning a.id, row.old_status, a.status as new_status
)
insert into application_events (
    application_id, from_status, to_status, history_action_id
)
select id, old_status, new_status, @history_action_id::bigint
from updated
where old_status <> new_status;

-- name: UpdateApplication :exec
update applications a
set
    company_name = @company_name,
    role_title = sqlc.narg('role_title'),
    status = @status::application_status,
    url = sqlc.narg('url'),
    location = sqlc.narg('location'),
    arrangement = sqlc.narg('arrangement')::work_arrangement,
    applied_at = case
        when a.applied_at is null
            and a.status <> 'applied'
            and @status::application_status = 'applied'
            and sqlc.narg('applied_at')::date is null
        then (current_timestamp at time zone @time_zone::text)::date
        else sqlc.narg('applied_at')::date
    end,
    pay_min = sqlc.narg('pay_min')::numeric,
    pay_max = sqlc.narg('pay_max')::numeric,
    pay_currency = @pay_currency,
    pay_period = sqlc.narg('pay_period')::pay_period,
    pay_note = sqlc.narg('pay_note')
from lists l
where a.list_id = l.id
    and a.id = @application_id
    and l.user_id = @user_id;

-- The same write with the pay columns left alone, for a quick edit that did not
-- touch the pay box. Re-parsing an untouched box would flatten whatever the
-- detail panel put in those columns, since one line of text cannot hold a
-- range, a currency, a bonus and a note at once.
-- name: UpdateApplicationFields :exec
update applications a
set
    company_name = @company_name,
    role_title = sqlc.narg('role_title'),
    status = @status::application_status,
    url = sqlc.narg('url'),
    location = sqlc.narg('location'),
    arrangement = sqlc.narg('arrangement')::work_arrangement,
    applied_at = case
        when a.applied_at is null
            and a.status <> 'applied'
            and @status::application_status = 'applied'
            and sqlc.narg('applied_at')::date is null
        then (current_timestamp at time zone @time_zone::text)::date
        else sqlc.narg('applied_at')::date
    end
from lists l
where a.list_id = l.id
    and a.id = @application_id
    and l.user_id = @user_id;

-- Every editable column, which is more than the row in the table can show. The
-- status is left out on purpose: it only moves by recording a step, so saving
-- the detail panel can never invent a transition.
-- name: UpdateApplicationDetail :exec
update applications a
set
    company_name = @company_name,
    role_title = sqlc.narg('role_title'),
    url = sqlc.narg('url'),
    location = sqlc.narg('location'),
    arrangement = sqlc.narg('arrangement')::work_arrangement,
    applied_at = sqlc.narg('applied_at')::date,
    pay_min = sqlc.narg('pay_min')::numeric,
    pay_max = sqlc.narg('pay_max')::numeric,
    pay_currency = @pay_currency,
    pay_period = sqlc.narg('pay_period')::pay_period,
    bonus_amount = sqlc.narg('bonus_amount')::numeric,
    pay_note = sqlc.narg('pay_note'),
    notes = sqlc.narg('notes')
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
insert into application_events (
    application_id, from_status, to_status, history_action_id
)
select
    a.id,
    a.status,
    @status::application_status,
    @history_action_id::bigint
from applications a
join lists l on l.id = a.list_id
where a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id
    and a.status <> @status::application_status;

-- name: SetApplicationsStatus :exec
update applications a
set
    status = @status::application_status,
    applied_at = case
        when @status::application_status = 'applied'
        then coalesce(
            a.applied_at,
            (current_timestamp at time zone @time_zone::text)::date
        )
        else a.applied_at
    end
from lists l
where a.list_id = l.id
    and a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id
    and a.status <> @status::application_status;

-- name: SetApplicationsArrangement :exec
update applications a
set arrangement = sqlc.narg('arrangement')::work_arrangement
from lists l
where a.list_id = l.id
    and a.id = any(@application_ids::uuid[])
    and l.user_id = @user_id
    and a.arrangement is distinct from
        sqlc.narg('arrangement')::work_arrangement;

-- The day an application was sent is the day whatever reported it is dated,
-- not the day the report was read. Bounded above by today, since the date can
-- come from a clock that is not ours and no application was sent in future.
-- name: SetApplicationStatus :exec
update applications a
set
    status = @status::application_status,
    applied_at = case
        when @status::application_status = 'applied'
        then coalesce(
            a.applied_at,
            (
                least(@occurred_at::timestamptz, current_timestamp)
                    at time zone @time_zone::text
            )::date
        )
        else a.applied_at
    end
from lists l
where a.list_id = l.id
    and a.id = @application_id
    and l.user_id = @user_id;
