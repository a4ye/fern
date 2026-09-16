import { describe, expect, it } from "bun:test";
import { formatPay, type PayPeriod } from "@/components/dashboard/data";
import { CURRENCIES, currencyForCountry, parsePay } from "@/lib/pay";

describe("parsePay", () => {
    it("reads a plain hourly rate", () => {
        expect(parsePay("$45/hr")).toEqual({
            payMin: "45.00",
            payMax: null,
            payCurrency: "USD",
            payPeriod: "hourly",
            payNote: null,
        });
    });

    it("reads a range with thousands shorthand", () => {
        expect(parsePay("120k-140k/yr")).toMatchObject({
            payMin: "120000.00",
            payMax: "140000.00",
            payPeriod: "yearly",
        });
    });

    it("reads an explicit currency code and comma grouping", () => {
        expect(parsePay("CAD 7,000 per month")).toMatchObject({
            payMin: "7000.00",
            payMax: null,
            payCurrency: "CAD",
            payPeriod: "monthly",
        });
    });

    it("prefers biweekly over weekly", () => {
        expect(parsePay("2500 biweekly").payPeriod).toBe("biweekly");
    });

    // A posting writes the period as an adjective, behind a connector, or as a
    // slash unit, and abbreviates any of them.
    it.each([
        ["$45 per hour", "hourly"],
        ["$45 an hour", "hourly"],
        ["$45 each hour", "hourly"],
        ["$45 / hr", "hourly"],
        ["$45 p/h", "hourly"],
        ["$2,000 a week", "weekly"],
        ["$2,000 per wk", "weekly"],
        ["$5,000 fortnightly", "biweekly"],
        ["$5,000 per fortnight", "biweekly"],
        ["$5,000 every 2 weeks", "biweekly"],
        ["$5,000 bi-weekly", "biweekly"],
        ["$9,000 each month", "monthly"],
        ["$9,000 /mth", "monthly"],
        ["£3,000 pcm", "monthly"],
        ["$120,000 annual salary", "yearly"],
        ["$120,000 per annum", "yearly"],
        ["$120,000 p.a.", "yearly"],
        ["£120,000 pa", "yearly"],
        ["$120,000 every year", "yearly"],
        ["$120k/y", "yearly"],
        ["$5,000 lump sum", "one_time"],
    ])("reads the period in %p", (input, period) => {
        expect(parsePay(input).payPeriod).toBe(period as PayPeriod);
    });

    // Whichever period the amount was quoted in comes first in the sentence;
    // how it is paid out comes after.
    it("takes the earliest period, not the first pattern", () => {
        expect(parsePay("$120,000 yearly, paid biweekly").payPeriod).toBe(
            "yearly",
        );
    });

    // Each part is looked for across the whole string, so none of them has to
    // come in any particular place.
    it.each([
        "120k CAD per year",
        "CAD 120k yearly",
        "yearly 120k CAD",
        "Annual salary: CAD 120,000",
        "per year 120,000 CAD",
    ])("reads the parts in any order: %p", (input) => {
        expect(parsePay(input)).toMatchObject({
            payMin: "120000.00",
            payCurrency: "CAD",
            payPeriod: "yearly",
        });
    });

    // Two numbers are a range only when something joins them. Prose between
    // them means the second is a bonus, a percentage or a retirement plan.
    it.each([
        ["$120k base + 15% bonus + equity", "120000.00"],
        ["$120k + $10k signing", "120000.00"],
        ["$120,000 base salary, 20% target bonus", "120000.00"],
        ["$120,000 + 401k", "120000.00"],
        ["401k, $120,000/yr", "120000.00"],
    ])("does not read %p as a range", (input, payMin) => {
        expect(parsePay(input)).toMatchObject({ payMin, payMax: null });
    });

    it.each([
        "$120,000 - $160,000",
        "$120,000 USD - $160,000 USD",
        "120,000 to 160,000",
        "between 120,000 and 160,000",
        "120,000–160,000",
    ])("still reads a joined pair as a range: %p", (input) => {
        expect(parsePay(input)).toMatchObject({
            payMin: "120000.00",
            payMax: "160000.00",
        });
    });

    // A glyph repeated on the far end of a range is the same currency said
    // twice, not prose between two numbers. The plain "$" ranges above only
    // worked because that glyph carries no letters to be mistaken for words.
    it.each([
        ["CA$140K – CA$188K", "CAD", "140000.00", "188000.00"],
        ["R$675K – R$750K", "BRL", "675000.00", "750000.00"],
        ["A$130K – A$145K", "AUD", "130000.00", "145000.00"],
        ["NZ$100K – NZ$120K", "NZD", "100000.00", "120000.00"],
    ])("keeps both ends of %p", (input, payCurrency, payMin, payMax) => {
        expect(parsePay(input)).toMatchObject({ payMin, payMax, payCurrency });
    });

    it("reads an amount followed by a separate bonus", () => {
        expect(parsePay("$2k / month + $1k bonus")).toMatchObject({
            payMin: "2000.00",
            payMax: null,
            payPeriod: "monthly",
        });
    });

    // A percentage is a share of something else, so it is never the pay, and
    // that holds whichever side of the salary it is written on.
    it.each([
        "$120k base + 15% bonus",
        "20% bonus, $120,000",
        "$120,000 base salary, 20% target bonus",
    ])("does not read a percentage as pay: %p", (input) => {
        expect(parsePay(input).payMin).toBe("120000.00");
    });

    // Half the world writes 120.000,50 for what the other half writes as
    // 120,000.50, and a dot is only a decimal point in one of them.
    it.each([
        ["120.000 EUR", "120000.00"],
        ["1.000.000 EUR", "1000000.00"],
        ["€1.234.567,89", "1234567.89"],
        ["€60,50", "60.50"],
        ["$120,000.50", "120000.50"],
        ["$120,000", "120000.00"],
        ["$32.50", "32.50"],
    ])("reads %p as %p whichever way it is grouped", (input, payMin) => {
        expect(parsePay(input).payMin).toBe(payMin);
    });

    it("reads a range written with dot grouping", () => {
        expect(parsePay("€60.000 - €80.000")).toMatchObject({
            payMin: "60000.00",
            payMax: "80000.00",
            payCurrency: "EUR",
        });
    });

    it("does not read the 2 in /2wk as an amount", () => {
        expect(parsePay("3000/2wk")).toMatchObject({
            payMin: "3000.00",
            payMax: null,
            payPeriod: "biweekly",
        });
    });

    it("keeps text with no amount as a note", () => {
        expect(parsePay("Competitive")).toEqual({
            payMin: null,
            payMax: null,
            payCurrency: "USD",
            payPeriod: null,
            payNote: "Competitive",
        });
    });

    it("keeps an amount too large for the column as a note", () => {
        expect(parsePay("99999999m")).toEqual({
            payMin: null,
            payMax: null,
            payCurrency: "USD",
            payPeriod: null,
            payNote: "99999999m",
        });
        expect(parsePay("9999999999.99").payMin).toBe("9999999999.99");
        expect(parsePay("120k - 99999999m").payMin).toBeNull();
    });

    it("collapses a range whose ends are equal", () => {
        expect(parsePay("$50-$50/hr").payMax).toBeNull();
    });

    it("orders a reversed range", () => {
        expect(parsePay("140000 to 120000 yearly")).toMatchObject({
            payMin: "120000.00",
            payMax: "140000.00",
        });
    });

    it("treats blank input as no pay at all", () => {
        expect(parsePay("  ")).toMatchObject({ payMin: null, payNote: null });
    });

    it("keeps the cents on an hourly rate", () => {
        const parsed = parsePay("$32.50 an hour");
        expect(parsed.payMin).toBe("32.50");
        expect(formatPay(parsed)).toBe("USD 32.50/hr");
    });

    it("reads a currency with no symbol in this locale", () => {
        expect(parsePay("PLN 120000/yr")).toMatchObject({
            payMin: "120000.00",
            payCurrency: "PLN",
            payPeriod: "yearly",
        });
    });

    it("reads a symbol belonging to one currency alone", () => {
        expect(parsePay("₩60,000,000/yr").payCurrency).toBe("KRW");
        expect(parsePay("zł 8000/mo").payCurrency).toBe("PLN");
    });

    // The user's default currency stands in for the text's silence, so it must
    // never overrule a currency the text names for itself.
    it("falls back to the given currency only when the text names none", () => {
        expect(parsePay("120000/yr", "CAD").payCurrency).toBe("CAD");
        expect(parsePay(null, "CAD").payCurrency).toBe("CAD");
        expect(parsePay("competitive", "CAD").payCurrency).toBe("CAD");
        expect(parsePay("USD 120000/yr", "CAD").payCurrency).toBe("USD");
        expect(parsePay("€90,000", "CAD").payCurrency).toBe("EUR");
    });

    // Codes that are also English words are the reason the whole list cannot
    // just be matched case-insensitively.
    it("reads a word-like code only when it is capitalised", () => {
        expect(parsePay("ALL 120000/yr").payCurrency).toBe("ALL");
        expect(parsePay("120k all in").payCurrency).toBe("USD");
    });

    it("reads spaces as thousands grouping, not as separate amounts", () => {
        expect(parsePay("50 000 SEK/mo")).toMatchObject({
            payMin: "50000.00",
            payMax: null,
            payCurrency: "SEK",
        });
        expect(parsePay("1 200 000 JPY").payMin).toBe("1200000.00");
    });

    it("carries a range's shorthand suffix back to its lower end", () => {
        expect(parsePay("120-140k/yr")).toMatchObject({
            payMin: "120000.00",
            payMax: "140000.00",
        });
    });

    // The editor seeds its input from the rendered label, so a saved row that is
    // opened and saved again must not drift.
    it("round-trips its own formatted output", () => {
        const parsed = parsePay("120k-140k/yr");
        const label = formatPay(parsed);
        expect(label).toBe("USD 120,000–140,000/yr");
        expect(parsePay(label)).toEqual(parsed);
    });

    // A label printed in one of these used to come back as dollars, since "CA$"
    // carries a "$". Every currency the picker offers now has to survive it.
    it("reads back every currency it offers", () => {
        for (const payCurrency of CURRENCIES) {
            const fields = {
                payMin: "120000.00",
                payMax: "140000.00",
                payCurrency,
                payPeriod: "yearly" as const,
                payNote: null,
            };
            expect(parsePay(formatPay(fields) as string)).toEqual(fields);
        }
    });
});

// What a pay text leaves unsaid, read back out of the figures themselves.
describe("the period a bare amount implies", () => {
    // Roughly what a dollar bought when these were written. Only the size of
    // each currency matters here, so a rate being a month out of date cannot
    // change which period an amount reads as.
    const RATES = { USD: 1, CAD: 1.37, EUR: 0.92, INR: 87, JPY: 155 };

    const periodOf = (input: string, fallbackCurrency = "USD") =>
        parsePay(input, fallbackCurrency, RATES).payPeriod;

    // Nobody is paid 60 dollars a year, and nobody is paid 120,000 an hour, so
    // the amount names the period on its own.
    it.each([
        ["60 usd", "hourly"],
        ["$45", "hourly"],
        ["$17.50", "hourly"],
        ["$200", "hourly"],
        ["$120,000", "yearly"],
        ["$85,000", "yearly"],
        ["$450,000", "yearly"],
        ["CAD 95,000", "yearly"],
        ["€70,000", "yearly"],
    ])("reads %p as %p", (input, period) => {
        expect(periodOf(input)).toBe(period as PayPeriod);
    });

    // A range says more than either end alone: 40,000 on its own could be a
    // month's pay or a year's, but 60,000 a month is past believing.
    it.each([
        ["$100-$200", "hourly"],
        ["$40,000 - $60,000", "yearly"],
        ["$120,000-$500,000", "yearly"],
    ])("reads the range %p as %p", (input, period) => {
        expect(periodOf(input)).toBe(period as PayPeriod);
    });

    // Weekly, fortnightly and monthly pay lie too close together to be told
    // apart, so an amount that could be any of them is left alone. So is one
    // too large or too small to be a year's pay under any reading.
    it.each(["$3,000", "$7,000", "$25,000", "$500", "$2", "$3,000,000"])(
        "leaves %p unread",
        (input) => {
            expect(periodOf(input)).toBeNull();
        },
    );

    // A stated period is a fact about the posting and outranks anything the
    // figures suggest, however odd the pair look together.
    it("never overrules a period the text states", () => {
        expect(periodOf("$120,000/hr")).toBe("hourly");
        expect(periodOf("$60 per year")).toBe("yearly");
        expect(periodOf("$5,000 lump sum")).toBe("one_time");
    });

    // The same digits are a year's pay in one country and a fortnight's in
    // another, so a figure is weighed in the money it was written in.
    it("weighs an amount in its own currency", () => {
        expect(periodOf("$60,000")).toBe("yearly");
        expect(periodOf("₹60,000")).toBeNull();
        expect(periodOf("¥8,000,000")).toBe("yearly");
        expect(periodOf("¥3,000")).toBe("hourly");
    });

    // The user's own default is what an amount is weighed in when the text
    // names no currency, the same as it is for the currency column.
    it("weighs a bare amount in the currency that stands in for it", () => {
        expect(periodOf("60,000", "USD")).toBe("yearly");
        expect(periodOf("60,000", "INR")).toBeNull();
    });

    // A currency the rates cannot cover has no knowable size, and a figure of
    // unknown size is no evidence at all.
    it("says nothing about a currency the rates do not quote", () => {
        expect(parsePay("60 usd").payPeriod).toBe("hourly");
        expect(parsePay("ZAR 60").payPeriod).toBeNull();
        expect(parsePay("60 usd", "USD", {}).payPeriod).toBe("hourly");
    });

    it("has nothing to read where there is no amount", () => {
        expect(periodOf("Competitive")).toBeNull();
        expect(periodOf("  ")).toBeNull();
    });
});

describe("currencyForCountry", () => {
    it("reads a currency code back to the country that spends it", () => {
        expect(currencyForCountry("CA")).toBe("CAD");
        expect(currencyForCountry("gb")).toBe("GBP");
        expect(currencyForCountry("IN")).toBe("INR");
        expect(currencyForCountry("JP")).toBe("JPY");
        expect(currencyForCountry("CH")).toBe("CHF");
    });

    // The one currency whose code names no country of its own, and the reason
    // its members are written out rather than derived.
    it("pays the euro in every country that uses it", () => {
        for (const country of ["DE", "IE", "NL", "FR", "ES", "EE", "HR"]) {
            expect(currencyForCountry(country)).toBe("EUR");
        }
    });

    // A country whose money is named after somewhere else is better left to the
    // user's own default than answered with a guess.
    it("answers for no country it cannot name a currency for", () => {
        expect(currencyForCountry("CI")).toBeNull();
        expect(currencyForCountry("ZZ")).toBeNull();
        expect(currencyForCountry(null)).toBeNull();
    });
});
