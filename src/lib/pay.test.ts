import { describe, expect, it } from "bun:test";
import { formatPay, type PayPeriod } from "@/components/dashboard/data";
import { CURRENCIES, parsePay } from "@/lib/pay";

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
