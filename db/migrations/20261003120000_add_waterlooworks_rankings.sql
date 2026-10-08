-- migrate:up

-- How the employer ranked the student once WaterlooWorks interviews close. The
-- employer's first choice is the one the match pairs with the student's own
-- first, so it is told apart from the rest of the ranked. Null is a row with no
-- ranking yet, which is most of them: only interviewed jobs are ever ranked, and
-- only WaterlooWorks jobs at all.
create type waterlooworks_ranking as enum ('ranked_first', 'ranked', 'not_ranked');

alter table "applications"
    add column "ranking" waterlooworks_ranking;

-- The ranking means nothing to anyone outside Waterloo co-op, so its column
-- and field stay out of the way until the user turns them on.
alter table "user_settings"
    add column "waterloo_rankings" boolean not null default false;

-- migrate:down
alter table "user_settings"
    drop column "waterloo_rankings";

alter table "applications"
    drop column "ranking";

drop type waterlooworks_ranking;
