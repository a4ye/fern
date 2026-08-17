-- name: GetUserSettings :one
select default_currency, clean_links
from user_settings
where user_id = $1;

-- name: SaveUserSettings :exec
insert into user_settings (user_id, default_currency, clean_links)
values ($1, $2, $3)
on conflict (user_id) do update
set default_currency = excluded.default_currency,
    clean_links = excluded.clean_links,
    updated_at = now();
