-- The account an admin has asked to look at. Read on every request that
-- carries the view-as cookie, so it is the identity the rest of the app sees
-- rather than a copy taken when the viewing started.
-- name: GetUserById :one
select
    "id",
    "name",
    "email",
    "emailVerified" as email_verified,
    "image",
    "createdAt" as created_at,
    "updatedAt" as updated_at
from "user"
where "id" = @id;

-- What an account holds, so an admin can tell two similar addresses apart
-- without opening either of them.
-- name: SearchUsers :many
select
    u."id",
    u."name",
    u."email",
    u."createdAt" as created_at,
    (select count(*) from lists l where l.user_id = u."id")::int as lists,
    (select count(*)
     from applications a
     join lists l on l.id = a.list_id
     where l.user_id = u."id")::int as applications
from "user" u
where @search::text = ''
    or u."email" ilike '%' || @search || '%'
    or u."name" ilike '%' || @search || '%'
order by u."createdAt" desc
limit @page_limit::int;
