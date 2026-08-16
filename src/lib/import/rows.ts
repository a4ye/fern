// Reading a mapped sheet into applications: one outcome per row, so a file with
// three bad rows still imports the rest and can say which three were left.

import type {
    ApplicationRow,
    ApplicationStatus,
    Arrangement,
    PayPeriod,
} from "@/components/dashboard/data";
import { parsePay } from "@/lib/pay";
import { firstIssue, importRowSchema } from "@/lib/validation";
import type { ColumnMapping, ImportField } from "@/lib/import/fields";
import {
    detectDateOrder,
    matchArrangement,
    matchStatus,
    parseDay,
} from "@/lib/import/values";

export type Sheet = {
    headers: string[];
    rows: string[][];
};

// What one row becomes before it is written. Pay is still the sheet's own line
// of text; `parsePay` splits it into columns at the point of writing, the same
// way the quick-edit grid does.
export type ImportDraft = {
    company: string;
    role: string | null;
    status: ApplicationStatus;
    location: string | null;
    arrangement: Arrangement | null;
    pay: string | null;
    appliedAt: string | null;
    url: string | null;
    notes: string | null;
};

// What the user changed in the mapping step, keyed by the sheet's own text so
// that every row saying "Phone screen" is settled once. Only the changes: what
// a value matches on its own is worked out below, so both the mapping step and
// the rows it produces read a sheet the same way.
export type ValueChoices = {
    statuses: Record<string, ApplicationStatus>;
    arrangements: Record<string, Arrangement | null>;
};

// A duplicate carries what it repeats, not just that it repeats something: the
// application already in the list, or the earlier line of this file saying the
// same thing. Being told a row is a duplicate is no use without being able to
// go and look at the one it matched.
type Duplicate = {
    kind: "duplicate";
    line: number;
    draft: ImportDraft;
    key: string;
} & (
    | { against: "list"; existing: ApplicationRow }
    | { against: "file"; firstLine: number }
);

export type RowOutcome =
    | {
          kind: "ready";
          line: number;
          draft: ImportDraft;
          key: string;
          // Columns whose value could not be stored and were left empty so the
          // rest of the row could be kept. Reported rather than swallowed: a
          // link quietly going missing is worse than one that says it went.
          dropped: ImportField[];
      }
    | { kind: "invalid"; line: number; company: string; reason: string }
    | Duplicate;

const text = (row: readonly string[], column: number | undefined): string =>
    column === undefined ? "" : (row[column] ?? "").trim();

const orNull = (value: string): string | null => value || null;

// Values are compared with case and spacing set aside, so a sheet that writes a
// company three ways still settles it once.
export const valueKey = (raw: string): string =>
    raw.trim().replace(/\s+/g, " ").toLowerCase();

const part = (value: string | null): string => (value ? valueKey(value) : "");

// Amounts are decimal strings end to end, and the same figure can be written
// more than one way: a numeric column hands back "120000.00" where a parsed pay
// line gives "120000". Comparing them as text would call those two applications.
const amount = (value: string | null): string =>
    value === null ? "" : String(Number(value));

// Every column the table carries, so two rows count as the same application
// only when they agree on all of them. Notes are left out: a list's rows are
// read without them on purpose, and fetching a list's worth of free text to
// compare against would cost more than the check is worth.
const dedupeKey = (fields: {
    company: string;
    role: string | null;
    status: ApplicationStatus;
    location: string | null;
    arrangement: Arrangement | null;
    appliedAt: string | null;
    url: string | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    payNote: string | null;
}): string => {
    const amounts = fields.payMin ?? fields.payMax;
    return [
        part(fields.company),
        part(fields.role),
        fields.status,
        part(fields.location),
        fields.arrangement ?? "",
        fields.appliedAt ?? "",
        part(fields.url),
        amount(fields.payMin),
        amount(fields.payMax),
        // A row naming no figure still carries a currency, which says nothing
        // about the row and so must not tell two of them apart.
        amounts ? fields.payCurrency : "",
        fields.payPeriod ?? "",
        part(fields.payNote),
        // Joined on a character no spreadsheet cell carries, so "ab" and ""
        // cannot key the same as "a" and "b".
    ].join("\u0000");
};

const draftKey = (draft: ImportDraft, defaultCurrency: string): string => {
    const pay = parsePay(draft.pay, defaultCurrency);
    return dedupeKey({ ...draft, ...pay });
};

// The applications already in the list, keyed the same way a draft is so the
// two can be compared directly, and held rather than counted so a match can
// name what it matched. Where the list already repeats itself, the first row
// wins, which is the one a reader would find.
export const existingIndex = (
    rows: readonly ApplicationRow[],
): Map<string, ApplicationRow> => {
    const index = new Map<string, ApplicationRow>();
    for (const row of rows) {
        const key = dedupeKey(row);
        if (!index.has(key)) index.set(key, row);
    }
    return index;
};

// What a value in the status column comes to: the user's answer if they gave
// one, otherwise this app's own reading, otherwise the status a row with an
// empty cell would get. The mapping step shows these, and the rows below are
// built from them, so what the user is shown is what gets written.
export const statusFor = (
    raw: string,
    edits: Record<string, ApplicationStatus>,
    fallback: ApplicationStatus,
): ApplicationStatus =>
    edits[valueKey(raw)] ?? (raw ? matchStatus(raw) : null) ?? fallback;

export const arrangementFor = (
    raw: string,
    edits: Record<string, Arrangement | null>,
): Arrangement | null => {
    const key = valueKey(raw);
    return key in edits ? edits[key] : raw ? matchArrangement(raw) : null;
};

// The distinct things one column says, in the order they first appear, which is
// what the mapping step asks the user about.
export const distinctValues = (
    sheet: Sheet,
    column: number | undefined,
): string[] => {
    if (column === undefined) return [];
    const seen = new Map<string, string>();
    for (const row of sheet.rows) {
        const raw = text(row, column);
        if (!raw) continue;
        const key = valueKey(raw);
        if (!seen.has(key)) seen.set(key, raw);
    }
    return [...seen.values()];
};

// A row that says nothing at all is a trailing blank line rather than a failed
// import, so it is passed over without being counted against the file.
const isBlank = (row: readonly string[]) =>
    row.every((cell) => !cell || !cell.trim());

// An application can be stored without any of these, so a value one of them
// cannot hold costs that column rather than the whole row. The company is not
// among them: there is nothing to file an application under without it.
const DROPPABLE = new Set<string>([
    "role",
    "location",
    "pay",
    "appliedAt",
    "url",
    "notes",
]);

type Read =
    | { ok: true; draft: ImportDraft; dropped: ImportField[] }
    | { ok: false; reason: string };

// Drops one refused column at a time and tries again, so a row with a bad link
// and a bad date loses both rather than the first one found deciding the row.
// Emptying a column always satisfies its own rule, so a column can only be
// dropped once and the loop cannot outlast the list above it.
const readCandidate = (
    candidate: Record<string, unknown>,
    alreadyDropped: ImportField[],
): Read => {
    let working = candidate;
    const dropped = [...alreadyDropped];

    for (let pass = 0; pass <= DROPPABLE.size; pass += 1) {
        const parsed = importRowSchema.safeParse(working);
        if (parsed.success) {
            return { ok: true, draft: parsed.data, dropped };
        }

        const field = String(parsed.error.issues[0]?.path[0] ?? "");
        if (!DROPPABLE.has(field)) {
            return { ok: false, reason: firstIssue(parsed.error) };
        }
        working = { ...working, [field]: null };
        dropped.push(field as ImportField);
    }

    return { ok: false, reason: "This row could not be read." };
};

export const buildRows = (
    sheet: Sheet,
    mapping: ColumnMapping,
    choices: ValueChoices,
    fallbackStatus: ApplicationStatus,
    alreadyInList: ReadonlyMap<string, ApplicationRow>,
    // The currency a row's pay is read as when its own text names none, which
    // has to be the one the write will use or an import would count a row it is
    // about to duplicate as new.
    defaultCurrency: string,
): RowOutcome[] => {
    // The whole column decides how its dates read, so a value that would work
    // either way is settled by its neighbours rather than guessed at.
    const order = detectDateOrder(
        mapping.appliedAt === undefined
            ? []
            : sheet.rows.map((row) => text(row, mapping.appliedAt)),
    );

    const outcomes: RowOutcome[] = [];
    // Keyed to the line that first said it, so a repeat can point back at it.
    const seenInFile = new Map<string, number>();

    sheet.rows.forEach((row, index) => {
        // The header takes the first line, so a row's own number is two ahead
        // of its index. Messages point at the line the user can go and look at.
        const line = index + 2;
        if (isBlank(row)) return;

        const company = text(row, mapping.company);
        const rawApplied = text(row, mapping.appliedAt);
        const appliedAt = rawApplied ? parseDay(rawApplied, order) : null;

        const rawStatus = text(row, mapping.status);
        const rawArrangement = text(row, mapping.arrangement);

        const candidate = {
            company,
            role: orNull(text(row, mapping.role)),
            status: statusFor(rawStatus, choices.statuses, fallbackStatus),
            location: orNull(text(row, mapping.location)),
            arrangement: arrangementFor(rawArrangement, choices.arrangements),
            pay: orNull(text(row, mapping.pay)),
            appliedAt,
            url: orNull(text(row, mapping.url)),
            notes: orNull(text(row, mapping.notes)),
        };

        // A date nobody can read is one refused column like any other, so it
        // costs the applied date rather than the application.
        const read = readCandidate(
            candidate,
            rawApplied && appliedAt === null ? ["appliedAt"] : [],
        );
        if (!read.ok) {
            outcomes.push({
                kind: "invalid",
                line,
                company,
                reason: read.reason,
            });
            return;
        }

        const { draft, dropped } = read;
        const key = draftKey(draft, defaultCurrency);

        const existing = alreadyInList.get(key);
        if (existing) {
            outcomes.push({
                kind: "duplicate",
                line,
                draft,
                key,
                against: "list",
                existing,
            });
            return;
        }

        const firstLine = seenInFile.get(key);
        if (firstLine !== undefined) {
            outcomes.push({
                kind: "duplicate",
                line,
                draft,
                key,
                against: "file",
                firstLine,
            });
            return;
        }

        seenInFile.set(key, line);
        outcomes.push({ kind: "ready", line, draft, key, dropped });
    });

    return outcomes;
};
