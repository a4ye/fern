-- migrate:up

-- Pasted job links arrive carrying the campaign that served them. Stripping it
-- is what a user wants by default, so the column is on for a user who has never
-- opened settings.
alter table "user_settings"
    add column "clean_links" boolean not null default true;

-- migrate:down
alter table "user_settings"
    drop column "clean_links";
