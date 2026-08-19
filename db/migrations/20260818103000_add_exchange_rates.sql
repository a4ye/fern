-- migrate:up

-- What one unit of the base currency buys of every other, so a column of pay
-- written in a dozen currencies can be put in one order. Shared by every
-- account: a rate is a fact about the world rather than about a user, and there
-- is no reason for two of them to fetch it twice.
--
-- One row per base, holding the whole set as it arrived. The alternative, a row
-- per currency, would be 160 rows rewritten on every refresh to answer a
-- question that always wants all of them at once.
--
-- The two stamps say different things. `fetched_at` is how old the numbers are,
-- which is what decides whether they can still be trusted; `checked_at` is when
-- the provider was last asked, which is what stops a provider that is down from
-- being asked again on every page load.
create table exchange_rates (
    "base_currency" text primary key,
    "rates"         jsonb not null,
    "fetched_at"    timestamptz not null,
    "checked_at"    timestamptz not null
);

-- migrate:down
drop table exchange_rates;
