-- name: GetUserSettings :one
select default_currency
from user_settings
where user_id = $1;

-- name: SaveUserSettings :exec
insert into user_settings (user_id, default_currency)
values ($1, $2)
on conflict (user_id) do update
set default_currency = excluded.default_currency,
    updated_at = now();
