-- migrate:up

-- WaterlooWorks turns most applications down before any interview, and says so
-- as "Not selected". Recording it is what makes a ranking mark every
-- WaterlooWorks job that has heard back, rather than only the interviewed few.
alter type waterlooworks_ranking add value 'not_selected';

-- migrate:down

-- Postgres cannot drop one value from an enum, so the type is rebuilt without
-- it, and the rows holding it go back to having no ranking.
update "applications" set "ranking" = null where "ranking" = 'not_selected';

alter type waterlooworks_ranking rename to waterlooworks_ranking_old;

create type waterlooworks_ranking as enum ('ranked_first', 'ranked', 'not_ranked');

alter table "applications"
    alter column "ranking" type waterlooworks_ranking
    using "ranking"::text::waterlooworks_ranking;

drop type waterlooworks_ranking_old;
