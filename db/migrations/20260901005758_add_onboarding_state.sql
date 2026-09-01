-- migrate:up

-- Null means the welcome has never been dismissed, so a user with no settings
-- row is a user who has not seen it. Skipping counts as seeing it: the welcome
-- is an introduction rather than a task, and asking twice reads as a nag.
alter table "user_settings"
    add column "onboarded_at" timestamptz;

-- Everyone who already has an account has already found their way around, so
-- they are marked done rather than introduced to an app they are using. Only
-- accounts created from here on start without a row and get the welcome.
insert into "user_settings" ("user_id", "onboarded_at")
select "id", now() from "user"
on conflict ("user_id") do update set "onboarded_at" = now();

-- migrate:down
alter table "user_settings"
    drop column "onboarded_at";
