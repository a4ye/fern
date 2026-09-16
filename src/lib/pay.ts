// Pay is typed as free text ("120k-140k/yr", "$45/hr", "USD 7000/mo") and
// parsed here into the structured columns, so it can be sorted and formatted
// consistently. Anything that carries no amount is kept verbatim as a note.

import { PAY_PERIODS, type PayPeriod } from "@/components/dashboard/data";
import { RATE_BASE, inBaseCurrency, type ExchangeRates } from "@/lib/exchange";

export type PayFields = {
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    payNote: string | null;
};

export const DEFAULT_CURRENCY = "USD";

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

// A euro member is the one country the rule above cannot answer for, since the
// code names the union rather than any of the states inside it.
const EURO_COUNTRIES = `AD AT BE CY DE EE ES FI FR GR HR IE IT
     LT LU LV MC ME MT NL PT SI SK SM VA`.split(/\s+/);

// The same rule read backwards: what a country is paid in. One that spends
// money named after somewhere else (the CFA francs, the US dollar abroad) is
// left unanswered rather than guessed at.
const COUNTRY_CURRENCY = new Map<string, string>([
    ...CURRENCIES.flatMap((code): [string, string][] => {
        const country = currencyCountry(code);
        return country && code !== "EUR" ? [[country.toUpperCase(), code]] : [];
    }),
    ...EURO_COUNTRIES.map((country): [string, string] => [country, "EUR"]),
]);

export const currencyForCountry = (
    countryCode: string | null,
): string | null =>
    countryCode
        ? (COUNTRY_CURRENCY.get(countryCode.toUpperCase()) ?? null)
        : null;

// Codes that are also ordinary English words, which is why a code cannot simply
// be matched case-insensitively: "120k all in" would be paid in Albanian lek.
// Written in capitals a code is deliberate, so these are read only that way.
const WORD_CODES = new Set([
    "ALL",
    "BAM",
    "BAN",
    "BOB",
    "COP",
    "CUP",
    "GEL",
    "MAD",
    "MOP",
    "PEN",
    "RUB",
    "TOP",
    "TRY",
]);

// Every live currency is understood. Capitals are taken at their word; anything
// else has to be a code that could not have been meant as English.
const CODE_UPPERCASE = new RegExp(`\\b(${CURRENCIES.join("|")})\\b`);

const CODE_ANY_CASE = new RegExp(
    `\\b(${CURRENCIES.filter((code) => !WORD_CODES.has(code)).join("|")})\\b`,
    "i",
);

const glyphOf = (
    currency: string,
    currencyDisplay: "symbol" | "narrowSymbol",
): string =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay,
    })
        .format(0)
        .replace(/[\d\s.,]/g, "");

// Glyphs come from the same formatter that prints a label rather than a list
// written out by hand, so whatever a label is printed with is read back as the
// currency it was printed for. Two kinds are dropped: a glyph shared by several
// currencies, which identifies none of them, and a plain-ASCII one ("kr", "R"),
// which would be found inside ordinary words. Those are left to the codes.
const claimGlyphs = (
    display: "symbol" | "narrowSymbol",
    claimed: Map<string, string>,
): void => {
    const owners = new Map<string, string[]>();
    for (const currency of CURRENCIES) {
        const glyph = glyphOf(currency, display);
        if (!glyph || claimed.has(glyph)) continue;
        owners.set(glyph, [...(owners.get(glyph) ?? []), currency]);
    }
    for (const [glyph, currencies] of owners) {
        if (currencies.length === 1 && /[^A-Za-z]/.test(glyph)) {
            claimed.set(glyph, currencies[0]);
        }
    }
};

// The printed form is claimed first so that "$" stays the dollar it is printed
// for, and the narrow forms only fill in currencies it left unspelled.
const GLYPH_CURRENCY: [string, string][] = (() => {
    const claimed = new Map<string, string>();
    claimGlyphs("symbol", claimed);
    claimGlyphs("narrowSymbol", claimed);
    // Longest first, or the "$" in "CA$" claims it for USD.
    return [...claimed].sort(([one], [two]) => two.length - one.length);
})();

// A period is written three ways, and a posting picks whichever it likes: as an
// adjective ("hourly"), as a unit behind a connector ("per hour", "an hour",
// "each year", "per yr"), or as a slash unit, which may carry a space because
// "100 CAD / hr" is how a person types it. Trailing "(?!\w)" rather than "\b"
// so a form ending in a dot ("p.a.") still terminates.
const periodPattern = (words: string, units: string): RegExp =>
    new RegExp(
        `\\b(?:${words})(?!\\w)` +
            `|\\b(?:per|an?|each|every)[-\\s]*(?:${units})(?!\\w)` +
            `|\\/\\s*(?:${units})(?!\\w)`,
        "i",
    );

const PERIOD_PATTERNS: [RegExp, PayPeriod][] = [
    [
        periodPattern(
            "bi-?weekly|fortnightly",
            "fortnights?|(?:2|two)\\s*w(?:ee)?ks?",
        ),
        "biweekly",
    ],
    // The bare letters are what makes "$45 p/h" work, since the slash branch
    // finds the "/h" inside it. "a" is deliberately not one of them: "N/A" is a
    // likelier thing to find in a pay field than "120,000/a".
    [periodPattern("hourly", "hours?|hrs?|h"), "hourly"],
    [periodPattern("weekly", "weeks?|wks?|w"), "weekly"],
    [periodPattern("monthly|pcm", "months?|mos?|mths?|m"), "monthly"],
    [
        periodPattern(
            "yearly|annually|annual|p\\.?a\\.?|p\\/a",
            "years?|yrs?|annum|y",
        ),
        "yearly",
    ],
    // The only one with no unit to put behind a slash.
    [/\b(?:one[-\s]?time|lump\s*sum|flat)(?!\w)/i, "one_time"],
];

const MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000 };

// The currency a pay text names, or null where it names none and something
// else has to answer for it.
export const payCurrencyIn = (value: string | null): string | null => {
    if (!value) return null;
    const capitals = value.match(CODE_UPPERCASE);
    if (capitals) return capitals[1];
    const code = value.match(CODE_ANY_CASE);
    if (code) return code[1].toUpperCase();
    for (const [glyph, currency] of GLYPH_CURRENCY) {
        if (value.includes(glyph)) return currency;
    }
    return null;
};

// Returns the period plus the text with the period words removed, so a token
// like "/2wk" cannot later be mistaken for the amount 2.
//
// The earliest phrasing in the string wins, not the first pattern in the list:
// "120,000 yearly, paid biweekly" is an annual salary, and whichever period the
// amount was written next to is the one it was quoted in. A tie goes to the
// longer match, which is what keeps "bi-weekly" from reading as "weekly".
const readPeriod = (
    value: string,
): { period: PayPeriod | null; rest: string } => {
    let best: { period: PayPeriod; text: string; at: number } | null = null;
    for (const [pattern, period] of PERIOD_PATTERNS) {
        const match = value.match(pattern);
        if (match?.index === undefined) continue;
        const closer = !best || match.index < best.at;
        const longer =
            best &&
            match.index === best.at &&
            match[0].length > best.text.length;
        if (closer || longer) {
            best = { period, text: match[0], at: match.index };
        }
    }
    if (!best) return { period: null, rest: value };
    return { period: best.period, rest: value.replace(best.text, " ") };
};

// Much of the world groups thousands with spaces, so "120 000" is one amount
// rather than 120 followed by 000. Runs until it settles, since each pass joins
// one group and "1 200 000" has two.
const joinGroups = (value: string): string => {
    let joined = value;
    let previous = "";
    while (joined !== previous) {
        previous = joined;
        joined = joined.replace(/(\d)\s(\d{3})(?!\d)/g, "$1$2");
    }
    return joined;
};

// Half the world writes 120,000.50 and the other half writes 120.000,50, so a
// dot is not reliably a decimal point. Within one number, whichever separator
// comes last is the decimal one; a lone separator with exactly three digits
// behind it is grouping, and anything else is a decimal point.
const normalizeNumber = (number: string): string => {
    const last = Math.max(number.lastIndexOf("."), number.lastIndexOf(","));
    if (last === -1) return number;

    const digits = number.replace(/[.,]/g, "");
    const decimals = number.length - last - 1;
    // Both kinds present means the last one is the decimal point whatever it
    // is. On its own, three digits behind it makes it a thousands separator.
    const mixed = number.includes(".") && number.includes(",");
    if (!mixed && decimals === 3) return digits;
    return `${digits.slice(0, digits.length - decimals)}.${digits.slice(digits.length - decimals)}`;
};

const normalizeSeparators = (value: string): string =>
    value.replace(/\d[\d.,]*\d/g, normalizeNumber);

// A US posting lists the retirement plan beside the salary often enough that
// "401k" would otherwise be read as four hundred thousand.
const PLAN_TOKENS = /\b40[13]\s*\(?[kb]\)?(?!\w)/gi;

// Two amounts are a range only when something actually joins them: a dash, a
// tilde, or a joining word. A comma, a plus or any prose in between means the
// second number is a different thing altogether, as in "$120k base + 15% bonus"
// or "$120,000/yr, 401k match". Currency written between the two ends is not
// prose, so it is dropped before the gap is judged. Glyphs go as well as codes,
// or the "CA" in "CA$140K – CA$188K" reads as prose and the range loses its top
// end; the plain "$" ranges only worked because that glyph has no letters.
const escape = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CURRENCY_NOISE = new RegExp(
    `\\b(?:${CURRENCIES.join("|")})\\b` +
        `|${GLYPH_CURRENCY.map(([glyph]) => escape(glyph)).join("|")}`,
    "gi",
);

const RANGE_JOIN =
    /^[^\p{L}\d]*(?:[-–—~]|\bto\b|\band\b|\buntil\b)[^\p{L}\d]*$/iu;

const joinsRange = (gap: string): boolean =>
    RANGE_JOIN.test(gap.replace(CURRENCY_NOISE, " "));

const readAmounts = (value: string): number[] => {
    const text = normalizeSeparators(joinGroups(value)).replace(
        PLAN_TOKENS,
        " ",
    );
    const found: {
        value: number;
        end: number;
        start: number;
        scale: number;
    }[] = [];
    for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*([kKmM])?/g)) {
        const base = Number(match[1]);
        if (!Number.isFinite(base)) continue;
        const end = match.index + match[0].length;
        // A percentage is a share of something else, never the pay itself, as
        // in "20% target bonus" sitting beside the salary.
        if (text[end] === "%") continue;
        const scale = match[2] ? MULTIPLIER[match[2].toLowerCase()] : 1;
        found.push({
            value: base * scale,
            start: match.index,
            end,
            scale,
        });
    }

    const [first, second] = found;
    if (!first) return [];
    if (!second || !joinsRange(text.slice(first.end, second.start))) {
        return [first.value];
    }

    // In "120-140k" the suffix is written once but meant for both ends, and
    // nobody is offered 120 dollars to 140,000. An end already past the
    // multiplier carries its own scale and is left alone.
    const carried = first.value < second.scale ? second.scale : 1;
    return [first.value * carried, second.value];
};

const asNumeric = (amount: number): string => amount.toFixed(2);

// numeric(12, 2) holds ten digits ahead of the point, and a parse that reads
// more than that has misread the text rather than found a salary: "99999999m"
// is a typo, not a wage. Measured after rounding, since that is the value the
// column is handed.
export const AMOUNT_MAX = 9_999_999_999.99;

const overflows = (amount: number): boolean =>
    Number(asNumeric(amount)) > AMOUNT_MAX;

// numeric(12, 2) comes back as "120000.00", which is not what anyone wants to
// see in a number field, so the editor shows the shortest form of the same
// amount.
export const payAmountInput = (amount: string | null): string =>
    amount === null ? "" : String(Number(amount));

// Every figure here but the first is calendar arithmetic. The hourly one is a
// judgement: a rate is read as a 40-hour week of a 52-week year, which is right
// for full-time work and overstates part-time work by whatever fraction of
// those hours it actually runs. An application has nowhere to record its hours,
// so this stands in for asking.
export const PER_YEAR: Record<PayPeriod, number> = {
    hourly: 40 * 52,
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    yearly: 1,
    one_time: 1,
};

// A posting that writes "60 USD" and stops has still said which period it meant,
// because nobody is paid 60 dollars a year and nobody is paid 120,000 an hour.
// So an amount is read back through the clock: a period is possible when it
// turns that amount into a year's pay somebody could actually be offered, and
// these are the two ends of what this app is willing to believe. The floor is a
// full-time year at under six dollars an hour, beneath every national minimum
// wage; the ceiling is a base salary at the top of the market.
const YEAR_FLOOR = 12_000;
const YEAR_CEILING = 480_000;

// A one-off is not a rate, so carrying it up to a year says nothing about it,
// and a payment of any size at all could be one. It is left out of the reckoning
// rather than guessed at.
const RATE_PERIODS = PAY_PERIODS.filter((period) => period !== "one_time");

// Weekly, fortnightly and monthly pay lie within a factor of five of one
// another, and no honest span of salaries is that narrow: an amount believable
// as one of the three is believable as its neighbours too, so none of them can
// ever be told from the others. They are reasons to say nothing rather than
// answers. Hourly stands forty times clear of the nearest of them and yearly
// twelve, which is what makes those two the ones a bare figure can name.
const NAMEABLE = new Set<PayPeriod>(["hourly", "yearly"]);

// The period an amount must have been quoted in, where exactly one would do.
const periodOfAmount = (amount: number): PayPeriod | null => {
    const believable = RATE_PERIODS.filter((period) => {
        const annual = amount * PER_YEAR[period];
        return annual >= YEAR_FLOOR && annual <= YEAR_CEILING;
    });
    if (believable.length !== 1) return null;
    return NAMEABLE.has(believable[0]) ? believable[0] : null;
};

// The period a pay figure was quoted in, for a text that named none. Amounts are
// weighed in the currency every rate is quoted against, since 60,000 is a year's
// pay in dollars and about a week's in rupees; a currency the rates cannot cover
// is left alone rather than held against the wrong yardstick.
//
// Both ends of a range are asked, and an end that cannot tell abstains rather
// than refuses: one end deciding while the other says nothing is what lets a
// range say more than either end alone. 40,000 on its own could be a month's pay
// or a year's, but "40,000-60,000" is yearly, because 60,000 a month is past
// believing. Two ends that name different periods are a text nobody can read,
// and answer nothing.
const inferPayPeriod = (
    figures: Pick<PayFields, "payMin" | "payMax" | "payCurrency">,
    rates: ExchangeRates,
): PayPeriod | null => {
    const found = new Set<PayPeriod>();
    for (const written of [figures.payMin, figures.payMax]) {
        if (written === null) continue;
        const amount = inBaseCurrency(
            Number(written),
            figures.payCurrency || RATE_BASE,
            rates,
        );
        if (amount === null) return null;
        const period = periodOfAmount(amount);
        if (period) found.add(period);
    }
    return found.size === 1 ? [...found][0] : null;
};

// `fallbackCurrency` is the user's own default, which stands in wherever the
// text names no currency of its own. A pay line that does name one still wins:
// the preference answers "120000/yr", not "CAD 120000/yr".
//
// `rates` are what size an amount against the money it is written in, and so are
// what lets a period be read back out of a text that never gave one. Callers
// that have none are answered from the amounts alone, which only the base
// currency can be measured in.
export const parsePay = (
    input: string | null,
    fallbackCurrency: string = DEFAULT_CURRENCY,
    rates: ExchangeRates = {},
): PayFields => {
    const raw = input?.trim() ?? "";
    if (!raw) {
        return {
            payMin: null,
            payMax: null,
            payCurrency: fallbackCurrency,
            payPeriod: null,
            payNote: null,
        };
    }

    const { period, rest } = readPeriod(raw);
    const amounts = readAmounts(rest);

    // No amount to work with, or none the column could hold, so the text is
    // worth more than a failed parse.
    if (amounts.length === 0 || amounts.some(overflows)) {
        return {
            payMin: null,
            payMax: null,
            payCurrency: fallbackCurrency,
            payPeriod: null,
            payNote: raw,
        };
    }

    const [first, second] = amounts;
    const min = Math.min(first, second ?? first);
    const max = Math.max(first, second ?? first);

    const figures = {
        payMin: asNumeric(min),
        payMax: second === undefined || max === min ? null : asNumeric(max),
        payCurrency: payCurrencyIn(raw) ?? fallbackCurrency,
    };

    return {
        ...figures,
        // What the text said it was, and only then what its own figures say it
        // must have been. A stated period is never second-guessed.
        payPeriod: period ?? inferPayPeriod(figures, rates),
        payNote: null,
    };
};
