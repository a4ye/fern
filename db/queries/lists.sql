-- name: ListListsForUser :many
select
    l.id,
    l.name,
    l.description,
    l.status,
    l.pinned_at,
    l.updated_at,
    count(a.id)::int as total_applications
from lists l
left join applications a on a.list_id = l.id
where l.user_id = @user_id
    and (
        @search::text = ''
        or l.name ilike '%' || @search || '%'
        or coalesce(l.description, '') ilike '%' || @search || '%'
    )
group by l.id
order by
    (l.pinned_at is not null) desc,
    case when @sort::text = 'name' then l.name end asc,
    case when @sort::text = 'applications' then count(a.id) end desc,
    l.updated_at desc
limit @page_limit::int
offset @page_offset::int;

-- name: CountListsForUser :one
select count(*)::int as total
from lists l
where l.user_id = @user_id
    and (
        @search::text = ''
        or l.name ilike '%' || @search || '%'
        or coalesce(l.description, '') ilike '%' || @search || '%'
    );

-- name: CreateList :one
insert into lists (user_id, name, description)
values (@user_id, @name, sqlc.narg('description'))
returning id, name, description, status, pinned_at, updated_at;

-- name: SetListPinned :exec
update lists set pinned_at = now() where id = $1 and user_id = $2;

-- name: SetListUnpinned :exec
update lists set pinned_at = null where id = $1 and user_id = $2;

-- name: GetListForUser :one
select id, name, description, status, created_at, updated_at
from lists
where id = $1 and user_id = $2;

-- name: UpdateList :one
update lists
set
    name = @name,
    description = sqlc.narg('description'),
    status = @status::list_status,
    updated_at = now()
where id = @id and user_id = @user_id
returning id, name, description, status, updated_at;

-- name: DeleteList :exec
delete from lists where id = $1 and user_id = $2;
