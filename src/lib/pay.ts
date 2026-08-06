// Pay is typed as free text ("120k-140k/yr", "$45/hr", "USD 7000/mo") and
// parsed here into the structured columns, so it can be sorted and formatted
// consistently. Anything that carries no amount is kept verbatim as a note.

import type { PayPeriod } from "@/components/dashboard/data";

export type PayFields = {
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    payNote: string | null;
};

const DEFAULT_CURRENCY = "USD";

const SYMBOL_CURRENCY: Record<string, string> = {
    $: "USD",
    "£": "GBP",
    "€": "EUR",
    "¥": "JPY",
    "₹": "INR",
};

const CURRENCY_CODES =
    /\b(USD|CAD|EUR|GBP|AUD|NZD|INR|JPY|CHF|SEK|SGD|HKD|MXN|BRL|CNY)\b/i;

// Longest phrasings first so "biweekly" is not swallowed by "weekly" and
// "per year" is not matched as "yearly" after the string has been cut up.
const PERIOD_PATTERNS: [RegExp, PayPeriod][] = [
    [
        /\b(bi-?weekly|every\s*two\s*weeks)\b|\/\s*2\s*(wk|weeks?)\b/i,
        "biweekly",
    ],
    [/\b(per\s*hour|hourly|an\s*hour)\b|\/\s*(hr|hour)\b/i, "hourly"],
    [/\b(per\s*week|weekly|a\s*week)\b|\/\s*(wk|week)\b/i, "weekly"],
    [/\b(per\s*month|monthly|a\s*month)\b|\/\s*(mo|month)\b/i, "monthly"],
    [
        /\b(per\s*annum|per\s*year|yearly|annually|annual|a\s*year)\b|\/\s*(yr|year)\b/i,
        "yearly",
    ],
    [/\b(one[-\s]?time|lump\s*sum|flat)\b/i, "one_time"],
];

const MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000 };

const readCurrency = (value: string): string => {
    const code = value.match(CURRENCY_CODES);
    if (code) return code[1].toUpperCase();
    for (const [symbol, currency] of Object.entries(SYMBOL_CURRENCY)) {
        if (value.includes(symbol)) return currency;
    }
    return DEFAULT_CURRENCY;
};

// Returns the period plus the text with the period words removed, so a token
// like "/2wk" cannot later be mistaken for the amount 2.
const readPeriod = (
    value: string,
): { period: PayPeriod | null; rest: string } => {
    for (const [pattern, period] of PERIOD_PATTERNS) {
        const match = value.match(pattern);
        if (match) return { period, rest: value.replace(match[0], " ") };
    }
    return { period: null, rest: value };
};

const readAmounts = (value: string): number[] => {
    const amounts: number[] = [];
    for (const match of value.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/g)) {
        const base = Number(match[1].replace(/,/g, ""));
        if (!Number.isFinite(base)) continue;
        const suffix = match[2]?.toLowerCase();
        amounts.push(suffix ? base * MULTIPLIER[suffix] : base);
    }
    return amounts;
};

const asNumeric = (amount: number): string => amount.toFixed(2);

export const parsePay = (input: string | null): PayFields => {
    const raw = input?.trim() ?? "";
    if (!raw) {
        return {
            payMin: null,
            payMax: null,
            payCurrency: DEFAULT_CURRENCY,
            payPeriod: null,
            payNote: null,
        };
    }

    const { period, rest } = readPeriod(raw);
    const amounts = readAmounts(rest);

    // No amount to work with, so the text is worth more than a failed parse.
    if (amounts.length === 0) {
        return {
            payMin: null,
            payMax: null,
            payCurrency: DEFAULT_CURRENCY,
            payPeriod: null,
            payNote: raw,
        };
    }

    const [first, second] = amounts;
    const min = Math.min(first, second ?? first);
    const max = Math.max(first, second ?? first);

    return {
        payMin: asNumeric(min),
        payMax: second === undefined || max === min ? null : asNumeric(max),
        payCurrency: readCurrency(raw),
        payPeriod: period,
        payNote: null,
    };
};
