-- migrate:up

-- A posting title carries the term it opens in and the programme it was
-- advertised under, neither of which tells one row from another. What is left
-- once those come off is a guess at what the user meant to record, so it is
-- offered a title at a time unless the user has said to take it every time.
alter table "user_settings"
    add column "tidy_titles" boolean not null default false;

-- migrate:down
alter table "user_settings"
    drop column "tidy_titles";
