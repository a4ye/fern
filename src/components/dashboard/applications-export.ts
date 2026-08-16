import {
    STATUS_META,
    arrangementLabel,
    payPeriodLabel,
    type ApplicationRow,
} from "@/components/dashboard/data";
import { buildXlsx, type XlsxCell, type XlsxColumn } from "@/lib/xlsx";

export type ExportFormat = "csv" | "xlsx" | "json";

// One definition of what leaves the app, rendered three ways: `header` names the
// column in a sheet, `key` names the same value in JSON.
type ExportColumn = XlsxColumn & {
    key: string;
    cell: (app: ApplicationRow) => XlsxCell;
};

const amount = (value: string | null) => (value ? Number(value) : null);

// Applied dates are calendar days with no time zone behind them, so they are
// built from their parts. `new Date(value)` would read them as UTC midnight and
// land on the day before for anyone west of it.
const day = (value: string | null) => {
    if (!value) return null;
    const [year, month, date] = value.split("-").map(Number);
    return new Date(year, month - 1, date);
};

// The table's own columns, plus the parts of the pay it renders into a single
// label and the link it shows as an icon. Together they are everything an
// application holds outside its notes and status trail, both of which are read
// one row at a time and so are not the table's to export.
const COLUMNS: ExportColumn[] = [
    {
        key: "company",
        header: "Company",
        width: 24,
        cell: (app) => app.company,
    },
    { key: "role", header: "Role", width: 26, cell: (app) => app.role },
    {
        key: "status",
        header: "Status",
        width: 16,
        cell: (app) => STATUS_META[app.status].label,
    },
    {
        key: "location",
        header: "Location",
        width: 20,
        cell: (app) => app.location,
    },
    {
        key: "arrangement",
        header: "Arrangement",
        width: 13,
        cell: (app) => app.arrangement && arrangementLabel(app.arrangement),
    },
    {
        key: "payMin",
        header: "Pay min",
        width: 11,
        cell: (app) => amount(app.payMin),
    },
    {
        key: "payMax",
        header: "Pay max",
        width: 11,
        cell: (app) => amount(app.payMax),
    },
    {
        // Every row carries a currency whether or not it names a figure, and one
        // sitting on its own says something about the row that is not true.
        key: "payCurrency",
        header: "Currency",
        width: 9,
        cell: (app) => (app.payMin ?? app.payMax) && app.payCurrency,
    },
    {
        key: "payPeriod",
        header: "Pay period",
        width: 11,
        cell: (app) => app.payPeriod && payPeriodLabel(app.payPeriod),
    },
    {
        key: "bonus",
        header: "Bonus",
        width: 11,
        cell: (app) => amount(app.bonus),
    },
    {
        key: "payNote",
        header: "Pay note",
        width: 22,
        cell: (app) => app.payNote,
    },
    {
        key: "appliedAt",
        header: "Applied",
        width: 12,
        format: "date",
        cell: (app) => day(app.appliedAt),
    },
    {
        key: "updatedAt",
        header: "Updated",
        width: 17,
        format: "datetime",
        cell: (app) => new Date(app.updatedAt),
    },
    { key: "url", header: "Link", width: 34, cell: (app) => app.url },
];

const pad = (value: number) => String(value).padStart(2, "0");

// Dates read the same in every file the app writes, on the clock the table drew
// them on. Sortable as text, which is what a CSV is read as.
const dateText = (value: Date, format: ExportColumn["format"]) => {
    const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    return format === "datetime"
        ? `${date} ${pad(value.getHours())}:${pad(value.getMinutes())}`
        : date;
};

// A cell a spreadsheet would run rather than read. Company names and links reach
// this app from job pages and scanned codes, so a value that opens like a
// formula is turned back into text before it lands in a file someone opens. Only
// text is guarded: a negative amount is a number and has to stay one.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const csvField = (value: XlsxCell, column: ExportColumn) => {
    if (value === null) return "";
    if (value instanceof Date) return dateText(value, column.format);
    if (typeof value === "number") return String(value);

    const text = FORMULA_LEAD.test(value) ? `'${value}` : value;
    return /["\r\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const applicationsCsv = (rows: ApplicationRow[]) =>
    [
        COLUMNS.map((column) => column.header).join(","),
        ...rows.map((app) =>
            COLUMNS.map((column) => csvField(column.cell(app), column)).join(
                ",",
            ),
        ),
    ].join("\r\n");

export const applicationsJson = (rows: ApplicationRow[]) =>
    JSON.stringify(
        rows.map((app) =>
            Object.fromEntries(
                COLUMNS.map((column) => {
                    const value = column.cell(app);
                    return [
                        column.key,
                        value instanceof Date
                            ? dateText(value, column.format)
                            : value,
                    ];
                }),
            ),
        ),
        null,
        2,
    );

export const applicationsXlsx = (rows: ApplicationRow[], sheet: string) =>
    buildXlsx({
        sheet,
        columns: COLUMNS,
        rows: rows.map((app) => COLUMNS.map((column) => column.cell(app))),
    });

const MIME: Record<ExportFormat, string> = {
    csv: "text/csv;charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    json: "application/json;charset=utf-8",
};

// A byte order mark, which is what tells Excel a .csv is UTF-8 rather than
// whatever the machine's code page happens to be.
const BOM = "\uFEFF";

export const applicationsFile = (
    rows: ApplicationRow[],
    format: ExportFormat,
    listName: string,
): Blob => {
    const body =
        format === "csv"
            ? BOM + applicationsCsv(rows)
            : format === "json"
              ? applicationsJson(rows)
              : applicationsXlsx(rows, listName);
    return new Blob([body], { type: MIME[format] });
};
