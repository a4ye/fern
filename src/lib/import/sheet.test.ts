import { describe, expect, test } from "bun:test";
import { MAX_IMPORT_ROWS, readSheet } from "@/lib/import/sheet";
import { buildXlsx } from "@/lib/xlsx";

const bytes = (text: string): ArrayBuffer =>
    new TextEncoder().encode(text).buffer as ArrayBuffer;

const read = (name: string, text: string) => readSheet(name, bytes(text));

const sheetOf = async (name: string, text: string) => {
    const result = await read(name, text);
    if (!result.ok) throw new Error(result.error);
    return result.sheet;
};

describe("csv", () => {
    test("takes the first line as the headings", async () => {
        const sheet = await sheetOf(
            "jobs.csv",
            "Company,Role\nAnthropic,Engineer\nVercel,Designer",
        );
        expect(sheet.headers).toEqual(["Company", "Role"]);
        expect(sheet.rows).toEqual([
            ["Anthropic", "Engineer"],
            ["Vercel", "Designer"],
        ]);
    });

    test("reads a quoted field holding the separator", async () => {
        const sheet = await sheetOf(
            "jobs.csv",
            'Company,Location\n"Acme, Ltd","Toronto, ON"',
        );
        expect(sheet.rows[0]).toEqual(["Acme, Ltd", "Toronto, ON"]);
    });

    test("drops the byte order mark a spreadsheet writes", async () => {
        const sheet = await sheetOf("jobs.csv", "﻿Company\nAnthropic");
        expect(sheet.headers).toEqual(["Company"]);
    });

    test("reads semicolons and tabs, which exports use as readily as commas", async () => {
        expect(
            (await sheetOf("jobs.csv", "Company;Role\nAcme;SWE")).headers,
        ).toEqual(["Company", "Role"]);
        expect(
            (await sheetOf("jobs.tsv", "Company\tRole\nAcme\tSWE")).rows[0],
        ).toEqual(["Acme", "SWE"]);
    });

    test("takes off the apostrophe another exporter added to guard a formula", async () => {
        const sheet = await sheetOf("jobs.csv", "Company,Pay\nAcme,'+ equity");
        expect(sheet.rows[0]).toEqual(["Acme", "+ equity"]);
    });

    test("leaves an apostrophe that is part of the text alone", async () => {
        const sheet = await sheetOf("jobs.csv", "Company\n'Round Table Co");
        expect(sheet.rows[0]).toEqual(["'Round Table Co"]);
    });

    test("passes over blank lines", async () => {
        const sheet = await sheetOf("jobs.csv", "Company\n\nAcme\n\n");
        expect(sheet.rows).toEqual([["Acme"]]);
    });
});

describe("refusing a file", () => {
    test("says so when there is nothing in it", async () => {
        expect(await read("jobs.csv", "")).toMatchObject({ ok: false });
    });

    test("says so when it has headings but no rows", async () => {
        expect(await read("jobs.csv", "Company,Role")).toMatchObject({
            ok: false,
            error: "That file has headings but no rows.",
        });
    });

    test("names the formats it takes when given another", async () => {
        const result = await read("resume.pdf", "Company\nAcme");
        expect(result).toMatchObject({ ok: false });
        if (!result.ok) expect(result.error).toContain(".xlsx");
    });

    test("refuses a file longer than it will import", async () => {
        const rows = Array.from(
            { length: MAX_IMPORT_ROWS + 1 },
            (_, index) => `Company ${index}`,
        ).join("\n");
        const result = await read("jobs.csv", `Company\n${rows}`);
        expect(result).toMatchObject({ ok: false });
        if (!result.ok) expect(result.error).toContain("at a time");
    });

    test("does not throw on a file that is not the shape its name claims", async () => {
        const result = await read("jobs.xlsx", "not a workbook at all");
        expect(result).toMatchObject({ ok: false });
    });
});

describe("xlsx", () => {
    // Built with this app's own writer rather than a checked-in binary, so the
    // fixture stays readable and cannot drift out of date.
    const workbook = () =>
        buildXlsx({
            sheet: "Applications",
            columns: [
                { header: "Company", width: 20 },
                { header: "Applied", width: 12, format: "date" },
                { header: "Pay", width: 12 },
            ],
            rows: [
                ["Anthropic", new Date(2026, 2, 5), 120000],
                ["Vercel", null, null],
            ],
        });

    const readWorkbook = async () => {
        const file = workbook();
        const result = await readSheet(
            "jobs.xlsx",
            file.buffer.slice(
                file.byteOffset,
                file.byteOffset + file.byteLength,
            ) as ArrayBuffer,
        );
        if (!result.ok) throw new Error(result.error);
        return result.sheet;
    };

    test("reads the headings and the cells under them", async () => {
        const sheet = await readWorkbook();
        expect(sheet.headers).toEqual(["Company", "Applied", "Pay"]);
        expect(sheet.rows[0][0]).toBe("Anthropic");
    });

    test("writes a date cell out in full, leaving nothing to guess", async () => {
        const sheet = await readWorkbook();
        expect(sheet.rows[0][1]).toBe("2026-03-05");
    });

    test("keeps a number as the figure it is", async () => {
        const sheet = await readWorkbook();
        expect(sheet.rows[0][2]).toBe("120000");
    });

    test("gives an empty cell as empty text", async () => {
        const sheet = await readWorkbook();
        expect(sheet.rows[1]).toEqual(["Vercel", "", ""]);
    });
});
