-- The account behind a GitHub sign-in. Adding a friend is done by the username
-- GitHub knows them as, which resolves to the numeric id better-auth stores, and
-- this is the step from there to the Fern account.
-- name: UserByGithubAccountId :one
select u.id, u.name, u.image
from "account" a
join "user" u on u.id = a."userId"
where a."providerId" = 'github' and a."accountId" = sqlc.arg(account_id);

-- name: GithubAccountIdForUser :one
select a."accountId"
from "account" a
where a."userId" = sqlc.arg(user_id) and a."providerId" = 'github';

-- Every accepted friendship, whichever column this user sits in. The pair is
-- symmetric once accepted, so the friend is always the other side of the row.
-- name: ListFriends :many
select
    f.id,
    case
        when f.requester_id = sqlc.arg(user_id) then f.addressee_id
        else f.requester_id
    end as friend_id,
    u.name as friend_name,
    u.image as friend_image,
    f.accepted_at
from friendships f
join "user" u on u.id = case
    when f.requester_id = sqlc.arg(user_id) then f.addressee_id
    else f.requester_id
end
where f.status = 'accepted'
    and (f.requester_id = sqlc.arg(user_id)
        or f.addressee_id = sqlc.arg(user_id))
order by u.name asc
-- Sits above the ceiling an accept enforces, so nothing anybody actually has is
-- hidden by it. It is here for the same reason every other read in this app
-- carries one: what a page costs to draw must not depend on how much of a table
-- somebody else managed to fill.
limit sqlc.arg(max_rows)::int;

-- Requests waiting on this user to answer.
-- name: ListIncomingRequests :many
select f.id, u.id as friend_id, u.name as friend_name, u.image as friend_image,
    f.created_at
from friendships f
join "user" u on u.id = f.requester_id
where f.addressee_id = sqlc.arg(user_id) and f.status = 'pending'
order by f.created_at desc
limit sqlc.arg(max_rows)::int;

-- Requests this user sent that nobody has answered yet.
-- name: ListOutgoingRequests :many
select f.id, u.id as friend_id, u.name as friend_name, u.image as friend_image,
    f.created_at
from friendships f
join "user" u on u.id = f.addressee_id
where f.requester_id = sqlc.arg(user_id) and f.status = 'pending'
order by f.created_at desc
limit sqlc.arg(max_rows)::int;

-- What already stands between these two, so an add can say which of "already
-- friends", "already asked" and "they asked you" applies rather than failing on
-- the unique index. Order-independent, matching the pair index.
-- name: FriendshipBetween :one
select f.id, f.requester_id, f.addressee_id, f.status
from friendships f
where least(f.requester_id, f.addressee_id)
        = least(sqlc.arg(user_id), sqlc.arg(other_id))
    and greatest(f.requester_id, f.addressee_id)
        = greatest(sqlc.arg(user_id), sqlc.arg(other_id));

-- The first two are counted against the per-account ceilings before a request is
-- sent. `received` is not a ceiling: it is the number the top bar puts on the
-- friends icon, counted here rather than read off the rows so drawing every
-- dashboard page does not cost a list of people nobody has opened yet.
-- name: CountFriendships :one
select
    count(*) filter (where f.status = 'accepted')::int as friends,
    count(*) filter (
        where f.status = 'pending' and f.requester_id = sqlc.arg(user_id)
    )::int as sent,
    count(*) filter (
        where f.status = 'pending' and f.addressee_id = sqlc.arg(user_id)
    )::int as received
from friendships f
where f.requester_id = sqlc.arg(user_id)
    or f.addressee_id = sqlc.arg(user_id);

-- Nothing is returned when the row already exists, which is what the caller
-- reads to tell a fresh request from a repeat.
-- name: CreateFriendRequest :one
insert into friendships (requester_id, addressee_id)
values (sqlc.arg(requester_id), sqlc.arg(addressee_id))
on conflict do nothing
returning id;

-- Only the person asked can accept, and only while it is still pending, so the
-- row this matches is the only one an accept could ever apply to.
--
-- The ceiling is counted here as well as when a request is sent, because
-- accepting is the other way the number goes up and a cap that binds only the
-- sender does not cap anything: an account that is asked can say yes without
-- end. Counted in the same statement as the update so the two cannot disagree.
-- name: AcceptFriendRequest :one
update friendships f
set status = 'accepted', accepted_at = now()
where f.id = sqlc.arg(id)
    and f.addressee_id = sqlc.arg(user_id)
    and f.status = 'pending'
    and (
        select count(*)
        from friendships held
        where held.status = 'accepted'
            and (held.requester_id = sqlc.arg(user_id)
                or held.addressee_id = sqlc.arg(user_id))
    ) < sqlc.arg(max_friends)::int
returning f.id;

-- Declining a request, cancelling one, and unfriending are the same row being
-- removed, and any of the two people in it may do it. The share grants that
-- named the other person go with it, since a grant to someone who is no longer
-- a friend is a grant nobody meant to leave standing.
-- name: DeleteFriendship :one
delete from friendships
where id = sqlc.arg(id)
    and (requester_id = sqlc.arg(user_id) or addressee_id = sqlc.arg(user_id))
returning
    case
        when requester_id = sqlc.arg(user_id) then addressee_id
        else requester_id
    end as other_id;

-- Drops the person grants either side made to the other. Called after a
-- friendship ends, so neither keeps a view of the other's lists.
-- name: DeleteSharesBetween :exec
delete from list_shares s
using lists l
where s.list_id = l.id
    and s.grantee_id is not null
    and (
        (l.user_id = sqlc.arg(user_id) and s.grantee_id = sqlc.arg(other_id))
        or (l.user_id = sqlc.arg(other_id) and s.grantee_id = sqlc.arg(user_id))
    );
