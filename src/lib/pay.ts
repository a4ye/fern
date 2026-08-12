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

export const currencyName = new Intl.DisplayNames(["en"], {
    type: "currency",
});

// Codes the runtime lists that nobody can be paid in today, kept as an
// exclusion so that a currency introduced tomorrow turns up on its own. Three
// groups: metals, funds and the "no currency" placeholders; the pre-euro
// national currencies; and the money of states that have since dissolved. The
// rest of the withdrawn ones are named with the years they ran, which is how
// the pattern below drops them without naming any.
const RETIRED = new Set(
    `XAU XAG XPT XPD XDR XXX XTS XBA XBB XBC XBD XSU XUA XRE XFO XFU XEU
     BOV CHE CHW CLF CNH CNX COU ECV MXV USN USS UYI UYW ZAL
     ADP ATS BEC BEF BEL CYP DEM EEK ESA ESB ESP FIM FRF GRD HRK IEP ITL LTL
     LTT LUC LUF LUL LVL LVR MCF MTL MTP NLG PTE SIT SKK
     ANG ARA BGL BGM BOP BUK CLE CSK CUC DDM ECS GEK GNS GQE GWE GWP HRD ILP
     MAF MDC MGF MLF MZE PEI RHD SRG SUR TJR TPE UAK YDD`.split(/\s+/),
);

// Every currency still in use, taken from the runtime rather than kept by hand
// so the picker is not a shortlist of the ones we happened to think of.
export const CURRENCIES: string[] = Intl.supportedValuesOf("currency").filter(
    (code) =>
        !RETIRED.has(code) && !/\(\d{4}/.test(currencyName.of(code) ?? ""),
);

// A currency code opens with the ISO country code of where it is spent, which
// is also how a flag is named. The shared ones (the CFA francs, the East
// Caribbean dollar) belong to no single country and so fly no flag.
export const currencyCountry = (code: string): string | null => {
    if (code.startsWith("X")) return null;
    return (code === "EUR" ? "eu" : code.slice(0, 2)).toLowerCase();
};

// The far smaller set the free-text parser will read as a currency. Codes are
// ordinary words often enough (ALL, TOP, TRY, CUP, MAD) that matching all 200
// of them would read "120k all in" as Albanian lek.
export const PARSED_CURRENCIES = [
    "USD",
    "CAD",
    "EUR",
    "GBP",
    "AUD",
    "NZD",
    "INR",
    "JPY",
    "CHF",
    "SEK",
    "SGD",
    "HKD",
    "MXN",
    "BRL",
    "CNY",
];

const CURRENCY_CODES = new RegExp(
    `\\b(${PARSED_CURRENCIES.join("|")})\\b`,
    "i",
);

// Taken from the same formatter that renders a pay label rather than written
// out by hand, so whatever a label is printed with is read back as the currency
// it was printed for. Longest first, or the "$" in "CA$" claims it for USD.
const SYMBOL_CURRENCY: [string, string][] = PARSED_CURRENCIES.map(
    (currency): [string, string] => [
        new Intl.NumberFormat("en-US", { style: "currency", currency })
            .format(0)
            .replace(/[\d\s.,]/g, ""),
        currency,
    ],
).sort(([one], [two]) => two.length - one.length);

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
    for (const [symbol, currency] of SYMBOL_CURRENCY) {
        if (symbol && value.includes(symbol)) return currency;
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

// numeric(12, 2) comes back as "120000.00", which is not what anyone wants to
// see in a number field, so the editor shows the shortest form of the same
// amount.
export const payAmountInput = (amount: string | null): string =>
    amount === null ? "" : String(Number(amount));

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
