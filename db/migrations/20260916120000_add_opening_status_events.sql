-- migrate:up

-- Every application now opens its history with the status it was created at.
-- Rows written before that was recorded are given one here: where a trail
-- already exists its first move says what the row moved away from, and where
-- none does the row has not moved, so it still sits where it started.
insert into application_events (
    application_id, from_status, to_status, occurred_at
)
select
    a.id,
    null::application_status,
    coalesce(first_move.from_status, a.status),
    -- Ahead of the move it precedes, which seeded rows can date before the
    -- application itself. least ignores the null a row with no moves gives.
    least(
        a.created_at,
        first_move.occurred_at - interval '1 microsecond'
    )
from applications a
left join lateral (
    select e.from_status, e.occurred_at
    from application_events e
    where e.application_id = a.id
    order by e.occurred_at, e.id
    limit 1
) first_move on true
where not exists (
    select 1
    from application_events e
    where e.application_id = a.id and e.from_status is null
);

-- migrate:down

delete from application_events where from_status is null;
