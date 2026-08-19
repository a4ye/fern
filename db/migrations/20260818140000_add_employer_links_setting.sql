-- migrate:up

-- An aggregator link records the wrong page, and the employer's own is offered
-- whenever a read finds it. The offer is a third party's claim about where the
-- listing came from, so it is accepted a link at a time unless the user has
-- said to take it every time.
alter table "user_settings"
    add column "employer_links" boolean not null default false;

-- migrate:down
alter table "user_settings"
    drop column "employer_links";
