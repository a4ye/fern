import { describe, expect, it } from "bun:test";
import { formatPay } from "@/components/dashboard/data";
import { parsePay } from "@/lib/pay";

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
        expect(formatPay(parsed)).toBe("$32.50/hr");
    });

    // The editor seeds its input from the rendered label, so a saved row that is
    // opened and saved again must not drift.
    it("round-trips its own formatted output", () => {
        const parsed = parsePay("120k-140k/yr");
        const label = formatPay(parsed);
        expect(label).toBe("$120,000–$140,000/yr");
        expect(parsePay(label)).toEqual(parsed);
    });
});
