import { describe, expect, test } from "bun:test";
import {
    applicationsCsv,
    applicationsJson,
} from "@/components/dashboard/applications-export";
import type { ApplicationRow } from "@/components/dashboard/data";

const app = (fields: Partial<ApplicationRow> = {}): ApplicationRow => ({
    id: "1",
    company: "Anthropic",
    role: null,
    status: "applied",
    pay: null,
    payNote: null,
    payMin: null,
    payMax: null,
    payCurrency: "USD",
    payPeriod: null,
    bonus: null,
    location: null,
    arrangement: null,
    appliedAt: null,
    url: null,
    updated: "Just now",
    updatedAt: "2026-01-01T09:30:00.000Z",
    ...fields,
});

const csvRows = (rows: ApplicationRow[]) => applicationsCsv(rows).split("\r\n");

const field = (row: ApplicationRow, header: string) => {
    const [headers, values] = csvRows([row]);
    return values.split(",")[headers.split(",").indexOf(header)];
};

const json = (row: ApplicationRow) => JSON.parse(applicationsJson([row]))[0];

describe("csv", () => {
    test("writes a heading row and one row per application", () => {
        const rows = csvRows([app(), app({ company: "Vercel" })]);
        expect(rows).toHaveLength(3);
        expect(rows[0].startsWith("Company,Role,Status")).toBe(true);
        expect(rows[1].startsWith("Anthropic,")).toBe(true);
        expect(rows[2].startsWith("Vercel,")).toBe(true);
    });

    test("quotes values holding a comma, a quote or a newline", () => {
        expect(field(app({ company: 'Ha"lf, Ltd' }), "Company")).toBe(
            '"Ha""lf',
        );
        expect(applicationsCsv([app({ role: "SWE\nIntern" })])).toContain(
            '"SWE\nIntern"',
        );
    });

    test("leaves a value that opens like a formula as text", () => {
        expect(field(app({ company: "=1+1" }), "Company")).toBe("'=1+1");
        expect(field(app({ company: "-Corp" }), "Company")).toBe("'-Corp");
        // Numbers go in as numbers, so a negative one keeps its sign.
        expect(field(app({ bonus: "-500" }), "Bonus")).toBe("-500");
    });

    test("blanks read as empty rather than as the word null", () => {
        expect(field(app(), "Role")).toBe("");
        expect(field(app(), "Applied")).toBe("");
    });

    test("names the currency only where there is a figure to name", () => {
        expect(field(app(), "Currency")).toBe("");
        expect(field(app({ payMin: "90000" }), "Currency")).toBe("USD");
    });

    test("keeps an applied date on its own day whatever the clock", () => {
        expect(field(app({ appliedAt: "2026-03-05" }), "Applied")).toBe(
            "2026-03-05",
        );
    });

    test("labels the statuses and arrangements rather than exporting keys", () => {
        expect(field(app({ status: "online_assessment" }), "Status")).toBe(
            "Online assessment",
        );
        expect(field(app({ arrangement: "hybrid" }), "Arrangement")).toBe(
            "Hybrid",
        );
    });
});

describe("json", () => {
    test("carries the same values under names a program can read", () => {
        expect(
            json(app({ payMin: "90000", payPeriod: "yearly", role: null })),
        ).toMatchObject({
            company: "Anthropic",
            role: null,
            status: "Applied",
            payMin: 90000,
            payCurrency: "USD",
            payPeriod: "Yearly",
            appliedAt: null,
        });
    });

    test("writes amounts as numbers, not the strings they arrive as", () => {
        expect(json(app({ payMax: "120000.50" })).payMax).toBe(120000.5);
    });
});
