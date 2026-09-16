-- Who a list is shared with by name, for the owner's share dialog. Scoped by
-- owner, so a list id belonging to somebody else returns nothing rather than
-- their grants.
-- name: ListSharesForList :many
select s.id, s.audience, s.grantee_id, u.name as grantee_name,
    u.image as grantee_image, s.created_at
from list_shares s
join lists l on l.id = s.list_id
left join "user" u on u.id = s.grantee_id
where s.list_id = sqlc.arg(list_id) and l.user_id = sqlc.arg(user_id)
order by s.audience asc, u.name asc;

-- name: ListLinksForList :many
select li.id, li.token, li.expires_at, li.revoked_at, li.view_count,
    li.last_viewed_at, li.created_at
from list_links li
join lists l on l.id = li.list_id
where li.list_id = sqlc.arg(list_id) and l.user_id = sqlc.arg(user_id)
order by li.created_at desc;

-- Both ceilings in one read, since a dialog that can add either needs to know
-- about both before it offers. Scoped to the owner like everything else here,
-- so a list id belonging to somebody else counts nothing rather than reporting
-- how far along their sharing is.
-- name: CountSharesForList :one
select
    (select count(*)::int from list_shares s where s.list_id = l.id) as shares,
    (select count(*)::int from list_links li where li.list_id = l.id) as links
from lists l
where l.id = sqlc.arg(list_id) and l.user_id = sqlc.arg(user_id);

-- Ownership is part of the insert rather than checked before it, so there is no
-- window between the two in which the list could change hands.
-- name: ShareListWithFriends :exec
insert into list_shares (list_id, audience)
select l.id, 'friends'
from lists l
where l.id = sqlc.arg(list_id) and l.user_id = sqlc.arg(user_id)
on conflict do nothing;

-- name: UnshareListWithFriends :exec
delete from list_shares s
using lists l
where s.list_id = l.id
    and s.list_id = sqlc.arg(list_id)
    and l.user_id = sqlc.arg(user_id)
    and s.audience = 'friends';

-- A named grant requires an accepted friendship as well as ownership, and both
-- are conditions of the insert itself. Nothing comes back when either fails,
-- which is what the action reports on: a caller naming an account they are not
-- friends with is told the same thing as one naming an account that is not
-- there, since neither is theirs to learn about.
-- name: ShareListWithPerson :one
insert into list_shares (list_id, audience, grantee_id)
select l.id, 'person', sqlc.arg(grantee_id)
from lists l
where l.id = sqlc.arg(list_id)
    and l.user_id = sqlc.arg(user_id)
    and exists (
        select 1 from friendships f
        where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id)
                = least(sqlc.arg(user_id), sqlc.arg(grantee_id))
            and greatest(f.requester_id, f.addressee_id)
                = greatest(sqlc.arg(user_id), sqlc.arg(grantee_id))
    )
on conflict do nothing
returning id;

-- name: UnshareListWithPerson :one
delete from list_shares s
using lists l
where s.list_id = l.id
    and s.list_id = sqlc.arg(list_id)
    and l.user_id = sqlc.arg(user_id)
    and s.grantee_id = sqlc.arg(grantee_id)
returning s.id;

-- name: CreateListLink :one
insert into list_links (list_id, token, expires_at)
select l.id, sqlc.arg(token), sqlc.narg(expires_at)::timestamptz
from lists l
where l.id = sqlc.arg(list_id) and l.user_id = sqlc.arg(user_id)
returning id, token, expires_at, revoked_at, view_count, last_viewed_at,
    created_at;

-- Revoking keeps the row so the dialog can still show what the link was and
-- when it stopped working. Already-revoked rows are left alone, so the date on
-- screen stays the one the link actually died on, and they still come back so
-- that revoking twice reads as done rather than as a failure.
-- name: RevokeListLink :one
update list_links li
set revoked_at = coalesce(li.revoked_at, now())
from lists l
where li.list_id = l.id
    and li.id = sqlc.arg(id)
    and l.user_id = sqlc.arg(user_id)
returning li.id;

-- name: DeleteListLink :one
delete from list_links li
using lists l
where li.list_id = l.id
    and li.id = sqlc.arg(id)
    and l.user_id = sqlc.arg(user_id)
returning li.id;

-- What an anonymous request is answered by. A token that is unknown, revoked or
-- past its date matches nothing, and the caller cannot tell those apart. The
-- owner comes back with it so the page can say whose list this is and so the
-- applications can be read under the account that owns them.
-- name: ListForLinkToken :one
select li.id as link_id, l.id as list_id, l.user_id as owner_id, l.name,
    l.description, u.name as owner_name, u.image as owner_image, li.expires_at
from list_links li
join lists l on l.id = li.list_id
join "user" u on u.id = l.user_id
where li.token = sqlc.arg(token)
    and li.revoked_at is null
    and (li.expires_at is null or li.expires_at > now());

-- Counted after the page has been sent, so a reader never waits on it.
-- name: RecordLinkView :exec
update list_links
set view_count = view_count + 1, last_viewed_at = now()
where id = sqlc.arg(id);

-- Whether this signed-in account may read that list, and the list if so. The
-- two ways in are a grant naming them and a grant to the owner's friends while
-- they are one, and both are settled here rather than in the caller. Returns
-- nothing for a list that is not shared with them, including one that does not
-- exist, so a caller cannot use this to learn which lists are real.
-- Being an accepted friend of the owner is required for either route in, so it
-- is asked once rather than inside the 'friends' branch alone. That is what
-- makes a named grant stop working the moment the friendship does, whatever
-- state the rows are in: unfriending deletes the grants it knows about, but two
-- people acting at the same moment can leave one behind, and a grant that
-- outlived its friendship must not still open the list. Cleanup is tidiness;
-- this is the boundary.
-- name: SharedListForViewer :one
select l.id, l.user_id as owner_id, l.name, l.description,
    u.name as owner_name, u.image as owner_image
from lists l
join "user" u on u.id = l.user_id
where l.id = sqlc.arg(list_id)
    and exists (
        select 1 from friendships f
        where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id)
                = least(l.user_id, sqlc.arg(viewer_id))
            and greatest(f.requester_id, f.addressee_id)
                = greatest(l.user_id, sqlc.arg(viewer_id))
    )
    and exists (
        select 1 from list_shares s
        where s.list_id = l.id
            and (
                s.audience = 'friends'
                or s.grantee_id = sqlc.arg(viewer_id)
            )
    );

-- The "Shared with you" section of the lists page. Same two routes in as above,
-- applied across every list rather than to one.
-- name: ListsSharedWithUser :many
select l.id, l.name, l.description, l.updated_at, l.user_id as owner_id,
    u.name as owner_name, u.image as owner_image,
    count(a.id)::int as total_applications
from lists l
join "user" u on u.id = l.user_id
left join applications a on a.list_id = l.id
where exists (
    select 1 from friendships f
    where f.status = 'accepted'
        and least(f.requester_id, f.addressee_id)
            = least(l.user_id, sqlc.arg(user_id))
        and greatest(f.requester_id, f.addressee_id)
            = greatest(l.user_id, sqlc.arg(user_id))
)
and exists (
    select 1 from list_shares s
    where s.list_id = l.id
        and (
            s.audience = 'friends'
            or s.grantee_id = sqlc.arg(user_id)
        )
)
group by l.id, u.name, u.image
order by l.updated_at desc
limit sqlc.arg(max_lists)::int;

-- The rows of a list somebody was let into. This one checks nothing: it is only
-- ever reached after ListForLinkToken or SharedListForViewer has said the
-- caller may read that list, and those are where the authorisation lives. Never
-- call it with a list id that has not been through one of them.
-- name: ApplicationsForSharedList :many
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
where a.list_id = sqlc.arg(list_id)
order by a.created_at desc, a.position desc
limit sqlc.arg(max_applications)::int;
