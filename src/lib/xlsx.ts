// Enough of the .xlsx format to write one sheet of values, and no more. The
// alternative was a spreadsheet library whose bundled zip machinery weighs more
// than everything else this page downloads, for a file that is a heading row
// and some cells.

export type XlsxCell = string | number | Date | null;

export type XlsxColumn = {
    header: string;
    // Roughly a count of characters at the default font, the only unit the
    // format offers for a column.
    width: number;
    // Excel holds every date as a number, so the column's format is the only
    // thing that says which parts of it to show.
    format?: "date" | "datetime";
};

// Control characters cannot be written in XML at all, and Excel refuses to open
// a file carrying one, so they are dropped rather than encoded.
const escapeXml = (value: string) =>
    value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

const columnName = (index: number) => {
    let name = "";
    for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
        name = String.fromCharCode(65 + (n % 26)) + name;
    }
    return name;
};

// Excel counts days from 1899-12-30 and has no notion of a time zone, so a
// moment is measured against the reader's own clock, the one the app drew it in.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

const serial = (value: Date) =>
    (value.getTime() - value.getTimezoneOffset() * 60_000 - EXCEL_EPOCH) /
    DAY_MS;

// Positions in the cellXfs list below.
const HEADER_STYLE = 1;
const DATE_STYLE = { date: 2, datetime: 3 };

const cellXml = (ref: string, value: XlsxCell, column: XlsxColumn) => {
    if (value === null || value === "") return "";
    if (value instanceof Date) {
        const style = DATE_STYLE[column.format ?? "date"];
        return `<c r="${ref}" s="${style}"><v>${serial(value)}</v></c>`;
    }
    if (typeof value === "number") {
        return Number.isFinite(value)
            ? `<c r="${ref}"><v>${value}</v></c>`
            : "";
    }
    // Inline strings rather than the shared table: a sheet written once and read
    // once gains nothing from pooling, and a cell that is never anything but a
    // string cannot be read back as a formula.
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
};

const rowXml = (cells: string, index: number) =>
    cells ? `<row r="${index}">${cells}</row>` : "";

const sheetXml = (columns: XlsxColumn[], rows: XlsxCell[][]) => {
    const last = `${columnName(columns.length - 1)}${rows.length + 1}`;
    const cols = columns
        .map(
            (column, index) =>
                `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`,
        )
        .join("");
    const head = columns
        .map(
            (column, index) =>
                `<c r="${columnName(index)}1" s="${HEADER_STYLE}" t="inlineStr"><is><t>${escapeXml(column.header)}</t></is></c>`,
        )
        .join("");
    const body = rows
        .map((cells, index) =>
            rowXml(
                columns
                    .map((column, at) =>
                        cellXml(
                            `${columnName(at)}${index + 2}`,
                            cells[at] ?? null,
                            column,
                        ),
                    )
                    .join(""),
                index + 2,
            ),
        )
        .join("");

    // The heading row is frozen and filterable, which is most of what anyone
    // opens a sheet of applications to do.
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rowXml(head, 1)}${body}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Four cell formats: plain, the bold heading, a day and a moment. The fonts,
// fills and borders under them are the shortest lists Excel accepts.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// Excel rejects a tab name over 31 characters or holding any of the characters
// it reserves for referring to one from a formula.
const tabName = (name: string) =>
    escapeXml(
        name
            .replace(/[[\]:*?/\\]/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 31)
            .trim(),
    ) || "Sheet1";

const workbookXml = (sheet: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${tabName(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let byte = 0; byte < 256; byte++) {
        let crc = byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        table[byte] = crc >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;

// 1980-01-01, the earliest a zip can record. Nothing shows the timestamps of the
// parts inside a workbook to anyone, and a fixed one makes the same sheet come
// out as the same file every time.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

// Stored rather than deflated. The payload is a few kilobytes of XML, and the
// browser has no synchronous compressor to reach for anyway.
const zip = (files: { name: string; text: string }[]) => {
    const encoder = new TextEncoder();
    const entries = files.map((file) => {
        const body = encoder.encode(file.text);
        return { name: encoder.encode(file.name), body, crc: crc32(body) };
    });

    const total = entries.reduce(
        (size, entry) =>
            size +
            LOCAL_HEADER +
            CENTRAL_HEADER +
            entry.name.length * 2 +
            entry.body.length,
        END_RECORD,
    );

    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    const offsets: number[] = [];
    let at = 0;

    for (const entry of entries) {
        offsets.push(at);
        view.setUint32(at, 0x04034b50, true);
        view.setUint16(at + 4, 20, true);
        // Bit 11 says the name is UTF-8.
        view.setUint16(at + 6, 0x0800, true);
        view.setUint16(at + 8, 0, true);
        view.setUint16(at + 10, DOS_TIME, true);
        view.setUint16(at + 12, DOS_DATE, true);
        view.setUint32(at + 14, entry.crc, true);
        view.setUint32(at + 18, entry.body.length, true);
        view.setUint32(at + 22, entry.body.length, true);
        view.setUint16(at + 26, entry.name.length, true);
        view.setUint16(at + 28, 0, true);
        out.set(entry.name, at + LOCAL_HEADER);
        out.set(entry.body, at + LOCAL_HEADER + entry.name.length);
        at += LOCAL_HEADER + entry.name.length + entry.body.length;
    }

    const directory = at;
    entries.forEach((entry, index) => {
        view.setUint32(at, 0x02014b50, true);
        view.setUint16(at + 4, 20, true);
        view.setUint16(at + 6, 20, true);
        view.setUint16(at + 8, 0x0800, true);
        view.setUint16(at + 10, 0, true);
        view.setUint16(at + 12, DOS_TIME, true);
        view.setUint16(at + 14, DOS_DATE, true);
        view.setUint32(at + 16, entry.crc, true);
        view.setUint32(at + 20, entry.body.length, true);
        view.setUint32(at + 24, entry.body.length, true);
        view.setUint16(at + 28, entry.name.length, true);
        view.setUint32(at + 30, 0, true);
        view.setUint32(at + 34, 0, true);
        view.setUint32(at + 38, 0, true);
        view.setUint32(at + 42, offsets[index], true);
        out.set(entry.name, at + CENTRAL_HEADER);
        at += CENTRAL_HEADER + entry.name.length;
    });

    view.setUint32(at, 0x06054b50, true);
    view.setUint16(at + 8, entries.length, true);
    view.setUint16(at + 10, entries.length, true);
    view.setUint32(at + 12, at - directory, true);
    view.setUint32(at + 16, directory, true);

    return out;
};

export const buildXlsx = ({
    sheet,
    columns,
    rows,
}: {
    sheet: string;
    columns: XlsxColumn[];
    rows: XlsxCell[][];
}): Uint8Array<ArrayBuffer> =>
    zip([
        { name: "[Content_Types].xml", text: CONTENT_TYPES },
        { name: "_rels/.rels", text: ROOT_RELS },
        { name: "xl/workbook.xml", text: workbookXml(sheet) },
        { name: "xl/_rels/workbook.xml.rels", text: WORKBOOK_RELS },
        { name: "xl/styles.xml", text: STYLES },
        { name: "xl/worksheets/sheet1.xml", text: sheetXml(columns, rows) },
    ]);
