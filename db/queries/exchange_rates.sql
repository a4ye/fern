-- Read the cached rates, and say in the same breath whether they are worth
-- replacing. Both conditions are asked of the database rather than of the app,
-- so the stamps are compared against the clock that wrote them.
--
-- Two gates, because the two ways this can go wrong want different answers. Old
-- numbers are the ordinary case and want a daily refresh. A provider that is
-- refusing is the other, and without the second gate every page load would ask
-- it again for as long as it stayed down.
-- name: GetExchangeRates :one
select
    rates,
    fetched_at <= current_timestamp
            - (sqlc.arg(rate_age_seconds)::int * interval '1 second')
        and checked_at <= current_timestamp
            - (sqlc.arg(retry_after_seconds)::int * interval '1 second')
        as refresh
from exchange_rates
where base_currency = sqlc.arg(base_currency);

-- name: SaveExchangeRates :exec
insert into exchange_rates (base_currency, rates, fetched_at, checked_at)
values (
    sqlc.arg(base_currency),
    sqlc.arg(rates),
    current_timestamp,
    current_timestamp
)
on conflict (base_currency) do update
set
    rates = excluded.rates,
    fetched_at = excluded.fetched_at,
    checked_at = excluded.checked_at;

-- Records that the provider was asked and gave nothing back, which is what
-- holds the next attempt off. The rates themselves are left alone: stale rates
-- sort a column far better than none do.
-- name: MarkExchangeRatesChecked :exec
update exchange_rates
set checked_at = current_timestamp
where base_currency = sqlc.arg(base_currency);
