// Reading an uploaded file into a grid of text. Server only: the two parsers
// below are far larger than the writer in src/lib/xlsx.ts, and the dashboard
// should not carry them just in case someone imports. The file itself is never
// stored; it lives as long as this call.

import Papa from "papaparse";
import { readSheet as readXlsxSheet } from "read-excel-file/node";
import type { Sheet } from "@/lib/import/rows";

// The write is one statement whatever the row count, so what this holds back is
// the browser: the mapping step re-reads every row through the schema on each
// change to a column or a status, and that is the work that grows with the file.
export const MAX_IMPORT_ROWS = 2000;

// Kept under the body a server action will carry, which this file both arrives
// in and the parsed rows go back out through. See serverActions.bodySizeLimit
// in next.config.ts; that ceiling has to stay the higher of the two.
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type SheetResult =
    { ok: true; sheet: Sheet } | { ok: false; error: string };

const pad = (value: number) => String(value).padStart(2, "0");

// A spreadsheet date arrives as a real Date, which is the one place a day
// reaches us already unambiguous. Writing it out in full spares the row builder
// from having to guess whether 03/05 is March or May.
const dayText = (value: Date) =>
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

const cellText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return dayText(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
};

// Some exporters guard against a spreadsheet running a cell it should only
// read, by writing a leading apostrophe ahead of anything that opens like a
// formula. It marks the text rather than belonging to it, so it comes back off.
const FORMULA_LEAD = /^'(?=[=+\-@])/;

const clean = (value: string) => value.replace(FORMULA_LEAD, "").trim();

const toSheet = (grid: string[][]): SheetResult => {
    const rows = grid.filter((row) => row.some((cell) => cell !== ""));
    const [headers, ...body] = rows;

    if (!headers || headers.every((cell) => cell === "")) {
        return { ok: false, error: "That file has no heading row." };
    }
    if (body.length === 0) {
        return { ok: false, error: "That file has headings but no rows." };
    }
    if (body.length > MAX_IMPORT_ROWS) {
        return {
            ok: false,
            error: `That file has ${body.length} rows. You can import ${MAX_IMPORT_ROWS} at a time.`,
        };
    }
    return { ok: true, sheet: { headers, rows: body } };
};

const parseCsv = (bytes: ArrayBuffer): SheetResult => {
    // A CSV written by a spreadsheet often opens with a byte order mark, which
    // would otherwise ride along on the first heading and stop it matching.
    const content = new TextDecoder("utf-8")
        .decode(bytes)
        .replace(/^\uFEFF/, "");
    // Delimiter is sniffed rather than assumed: European exports are commonly
    // semicolon separated, and a tab separated file is a CSV in all but name.
    const parsed = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });

    if (parsed.data.length === 0) {
        return { ok: false, error: "That file is empty." };
    }
    return toSheet(
        parsed.data.map((row) => row.map((cell) => clean(cell ?? ""))),
    );
};

const parseXlsx = async (bytes: ArrayBuffer): Promise<SheetResult> => {
    const grid = await readXlsxSheet(Buffer.from(bytes));
    return toSheet(grid.map((row) => row.map((cell) => clean(cellText(cell)))));
};

export const readSheet = async (
    name: string,
    bytes: ArrayBuffer,
): Promise<SheetResult> => {
    if (bytes.byteLength === 0)
        return { ok: false, error: "That file is empty." };
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
        return { ok: false, error: "That file is larger than 2 MB." };
    }

    const extension = name.toLowerCase().split(".").pop() ?? "";
    try {
        if (extension === "xlsx") return await parseXlsx(bytes);
        if (["csv", "tsv", "txt"].includes(extension)) return parseCsv(bytes);
        return {
            ok: false,
            error: "Choose a .csv or .xlsx file. Save an older .xls file as .xlsx first.",
        };
    } catch {
        // The parsers throw on a file that is not the shape its name claims,
        // which is a fact about the upload rather than a fault worth logging.
        return {
            ok: false,
            error: "That file could not be read. Check that it opens in a spreadsheet.",
        };
    }
};
