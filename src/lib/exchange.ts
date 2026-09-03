// Pay written in one currency says nothing about pay written in another until
// both are in the same money, so the table converts before it compares. Client
// and server both read this file.

// Every rate is quoted against one currency, which is the shape providers
// publish and the shape the cache holds: what one US dollar buys of each. A
// figure is therefore divided by its own rate, not multiplied by it.
export const RATE_BASE = "USD";

export type ExchangeRates = Record<string, number>;

// How old the numbers may be before new ones are fetched. Rates are published
// once a day, so asking oftener than that returns what is already held.
export const RATE_AGE_SECONDS = 24 * 60 * 60;

// How long a provider that answered with nothing is then left alone. Rates that
// are due and a provider that is down would otherwise put a request on every
// page load for as long as it stayed down.
export const RATE_RETRY_AFTER_SECONDS = 60 * 60;

// The same amount in the base currency, or null when nothing here can say. A
// currency the provider does not quote is left unconverted rather than guessed
// at, and the column sorts such a row where it sorts an empty one.
export const inBaseCurrency = (
    amount: number,
    currency: string,
    rates: ExchangeRates,
): number | null => {
    if (currency === RATE_BASE) return amount;
    const rate = rates[currency];
    return rate > 0 ? amount / rate : null;
};

// The same amount written in another currency, by way of the one every rate is
// quoted against. Null when either end is a currency the provider does not
// quote, which leaves the figure as it was written rather than guessed at.
export const convertAmount = (
    amount: number,
    from: string,
    to: string,
    rates: ExchangeRates,
): number | null => {
    const base = inBaseCurrency(amount, from, rates);
    if (base === null) return null;
    if (to === RATE_BASE) return base;
    const rate = rates[to];
    return rate > 0 ? base * rate : null;
};
