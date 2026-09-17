-- How much of an account's room is already used. Both figures come back
-- together because every write that needs one needs the other: an application
-- lands in a list and in an account at the same time.
-- name: ApplicationQuotaUsage :one
select
    count(*) filter (where a.list_id = sqlc.arg(list_id))::int as in_list,
    count(*)::int as total
from applications a
join lists l on l.id = a.list_id
where l.user_id = sqlc.arg(user_id);

-- How many moves an application has recorded, and how many of the ones a save
-- is dropping it actually holds. The second is counted here rather than taken
-- from the length of what was asked, because a save states which events it
-- drops and the delete matches them by id: an id this application does not hold
-- removes nothing, so counting the request rather than the match would let a
-- save claim room it is not making and record past the cap.
-- name: CountApplicationEvents :one
select
    count(*)::int as total,
    count(*) filter (
        where e.id = any(sqlc.arg(removed_event_ids)::uuid[])
    )::int as removing
from application_events e
join applications a on a.id = e.application_id
join lists l on l.id = a.list_id
where e.application_id = sqlc.arg(application_id)
    and l.user_id = sqlc.arg(user_id);

-- Which of these applications can record no further moves. A bulk status change
-- answers for many rows at once and cannot report a row at a time, so it acts
-- on the ones with room and leaves the rest as they are, history and status
-- together.
--
-- Asked this way round because the answer is almost always nothing: one grouped
-- pass over the events belonging to the selection, rather than a count per row,
-- which turned a selection of 1,500 into a two second query. Ownership is not
-- checked here, since counting is all this does and the write that follows is
-- what filters by user.
-- name: ApplicationsAtEventCap :many
select e.application_id
from application_events e
where e.application_id = any(sqlc.arg(application_ids)::uuid[])
group by e.application_id
having count(*) >= sqlc.arg(max_events)::int;
