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
select
    e.id,
    e.application_id,
    a.company_name,
    e.from_status,
    e.to_status,
    e.note,
    e.occurred_at
from application_events e
join applications a on a.id = e.application_id
where a.list_id = $1
order by e.application_id, e.occurred_at, e.id;

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

-- Apply all staged history edits after taking one application lock. Removed
-- events are deleted together, additions are chained in their submitted order,
-- and the application's final status is written once.
-- name: ApplyStatusStepEdits :exec
with locked as materialized (
    select a.id, a.status
    from applications a
    join lists l on l.id = a.list_id
    where a.id = @application_id and l.user_id = @user_id
    for update of a
),
deleted as (
    delete from application_events e
    using locked
    where e.application_id = locked.id
        and e.id = any(@removed_event_ids::uuid[])
    returning e.id
),
base as materialized (
    select
        locked.id,
        case
            when exists (select 1 from deleted) then coalesce(
                (
                    select e.to_status
                    from application_events e
                    where e.application_id = locked.id
                        and not (e.id = any(@removed_event_ids::uuid[]))
                    order by e.occurred_at desc, e.id desc
                    limit 1
                ),
                'not_applied'::application_status
            )
            else locked.status
        end as status
    from locked
),
additions as materialized (
    select addition.status, addition.ordinality
    from unnest(@added_statuses::application_status[])
        with ordinality as addition(status, ordinality)
),
inserted as (
    insert into application_events (
        application_id,
        from_status,
        to_status,
        occurred_at
    )
    select
        base.id,
        case
            when addition.ordinality = 1 then base.status
            else lag(addition.status) over (order by addition.ordinality)
        end,
        addition.status,
        statement_timestamp()
            + ((addition.ordinality - 1) * interval '1 microsecond')
    from base
    cross join additions addition
    returning to_status, occurred_at
),
final_status as (
    select coalesce(
        (
            select inserted.to_status
            from inserted
            order by inserted.occurred_at desc
            limit 1
        ),
        base.status
    ) as status
    from base
)
update applications a
set
    status = final_status.status,
    applied_at = case
        when final_status.status = 'applied' then coalesce(
            a.applied_at,
            (current_timestamp at time zone @time_zone::text)::date
        )
        else a.applied_at
    end
from final_status
where a.id = @application_id
    and (
        exists (select 1 from deleted)
        or exists (select 1 from inserted)
    );
