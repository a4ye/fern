-- name: GetUserSettings :one
select default_currency, clean_links, employer_links, tidy_titles
from user_settings
where user_id = $1;

-- name: SaveUserSettings :exec
insert into user_settings (user_id, default_currency, clean_links, employer_links, tidy_titles)
values ($1, $2, $3, $4, $5)
on conflict (user_id) do update
set default_currency = excluded.default_currency,
    clean_links = excluded.clean_links,
    employer_links = excluded.employer_links,
    tidy_titles = excluded.tidy_titles,
    updated_at = now();

-- name: GetOnboardedAt :one
select onboarded_at
from user_settings
where user_id = $1;

-- Onboarding is not a preference, so it is written on its own rather than
-- through SaveUserSettings, which would otherwise carry it on every form save.
-- name: MarkOnboarded :exec
insert into user_settings (user_id, onboarded_at)
values ($1, now())
on conflict (user_id) do update
set onboarded_at = now();
