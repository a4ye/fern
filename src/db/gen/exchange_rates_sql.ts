import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getExchangeRatesQuery = `-- name: GetExchangeRates :one
select
    rates,
    fetched_at <= current_timestamp
            - ($1::int * interval '1 second')
        and checked_at <= current_timestamp
            - ($2::int * interval '1 second')
        as refresh
from exchange_rates
where base_currency = $3`;

export interface GetExchangeRatesArgs {
    rateAgeSeconds: number;
    retryAfterSeconds: number;
    baseCurrency: string;
}

export interface GetExchangeRatesRow {
    rates: any;
    refresh: boolean | null;
}

export async function getExchangeRates(client: Client, args: GetExchangeRatesArgs): Promise<GetExchangeRatesRow | null> {
    const result = await client.query({
        text: getExchangeRatesQuery,
        values: [args.rateAgeSeconds, args.retryAfterSeconds, args.baseCurrency],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        rates: row[0],
        refresh: row[1]
    };
}

export const saveExchangeRatesQuery = `-- name: SaveExchangeRates :exec
insert into exchange_rates (base_currency, rates, fetched_at, checked_at)
values (
    $1,
    $2,
    current_timestamp,
    current_timestamp
)
on conflict (base_currency) do update
set
    rates = excluded.rates,
    fetched_at = excluded.fetched_at,
    checked_at = excluded.checked_at`;

export interface SaveExchangeRatesArgs {
    baseCurrency: string;
    rates: any;
}

export async function saveExchangeRates(client: Client, args: SaveExchangeRatesArgs): Promise<void> {
    await client.query({
        text: saveExchangeRatesQuery,
        values: [args.baseCurrency, args.rates],
        rowMode: "array"
    });
}

export const markExchangeRatesCheckedQuery = `-- name: MarkExchangeRatesChecked :exec
update exchange_rates
set checked_at = current_timestamp
where base_currency = $1`;

export interface MarkExchangeRatesCheckedArgs {
    baseCurrency: string;
}

export async function markExchangeRatesChecked(client: Client, args: MarkExchangeRatesCheckedArgs): Promise<void> {
    await client.query({
        text: markExchangeRatesCheckedQuery,
        values: [args.baseCurrency],
        rowMode: "array"
    });
}

