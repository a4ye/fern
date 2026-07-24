-- migrate:up
alter table "lists" add column "pinned_at" timestamptz;

create index "lists_user_pinned_idx" on "lists" ("user_id", "pinned_at");

-- migrate:down
drop index "lists_user_pinned_idx";
alter table "lists" drop column "pinned_at";
