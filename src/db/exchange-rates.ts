import { after } from "next/server";
import { getPool } from "@/db/client";
import * as gen from "@/db/gen/exchange_rates_sql";
import {
    RATE_AGE_SECONDS,
    RATE_BASE,
    RATE_RETRY_AFTER_SECONDS,
    type ExchangeRates,
} from "@/lib/exchange";

// Published once a day and quoted against every currency this app lets someone
// be paid in. Free either way: the keyless endpoint asks for a credit line in
// the interface instead, and a key buys that line back. One refresh a day is
// nowhere near the 1,500 calls a month the free key allows.
//
// Nobody there can be asked when a rate is wrong, which is why a figure these
// numbers convert is printed as an estimate, beside the one on record, and
// never written back over what the row says.
const provider = (key: string) =>
    `https://v6.exchangerate-api.com/v6/${key}/latest/${RATE_BASE}`;

// Whatever arrives is read one entry at a time and anything that is not a rate
// is dropped, so a currency the provider retires or sends as null costs that
// currency rather than the refresh. A reply carrying no usable rate at all is
// treated as no reply: it would otherwise overwrite good numbers with nothing.
const readRates = (payload: unknown): ExchangeRates | null => {
    const quoted = (payload as { conversion_rates?: unknown })
        ?.conversion_rates;
    if (typeof quoted !== "object" || quoted === null) return null;

    const rates: ExchangeRates = {};
    for (const [currency, rate] of Object.entries(quoted)) {
        if (typeof rate === "number" && rate > 0) {
            rates[currency] = rate;
        }
    }
    return rates[RATE_BASE] === 1 ? rates : null;
};

const fetchRates = async (): Promise<ExchangeRates | null> => {
    // Read at the point of use rather than held from the start, so a key added
    // to an environment takes effect there without a rebuild.
    const key = process.env.EXCHANGE_RATE_API_KEY;
    if (!key) return null;

    try {
        const response = await fetch(provider(key), {
            signal: AbortSignal.timeout(8000),
        });
        return response.ok ? readRates(await response.json()) : null;
    } catch {
        return null;
    }
};

// Coming back with nothing moves `checked_at` and leaves `fetched_at` where it
// was, which both holds the next attempt off and leaves the two stamps apart in
// the table for anyone asking why the numbers stopped moving. An environment
// with no key set never asks at all and reads the same way, which is what keeps
// it from writing a row on every page load.
const refresh = async (): Promise<ExchangeRates | null> => {
    const rates = await fetchRates();
    if (!rates) {
        await gen.markExchangeRatesChecked(getPool(), {
            baseCurrency: RATE_BASE,
        });
        return null;
    }
    await gen.saveExchangeRates(getPool(), {
        baseCurrency: RATE_BASE,
        rates,
    });
    return rates;
};

// Rates as the table should sort by them: whatever is cached, replaced in the
// background once it is old enough. A page waits on the provider only when this
// app has never reached it, since there is nothing else to answer with; every
// load after that is served from the database at the speed of one row.
//
// An empty set is a real answer and means the column cannot rank currencies it
// has no rate for. It only comes up before the first successful fetch.
export const getExchangeRates = async (): Promise<ExchangeRates> => {
    const cached = await gen.getExchangeRates(getPool(), {
        baseCurrency: RATE_BASE,
        rateAgeSeconds: RATE_AGE_SECONDS,
        retryAfterSeconds: RATE_RETRY_AFTER_SECONDS,
    });

    if (!cached) return (await refresh()) ?? {};
    if (cached.refresh) after(refresh);
    return cached.rates;
};
