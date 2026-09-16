import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "@/components/dashboard/data";
import {
    buildRows,
    distinctValues,
    existingIndex,
    type RowOutcome,
    type Sheet,
    type ValueChoices,
} from "@/lib/import/rows";
import type { ExchangeRates } from "@/lib/exchange";

const HEADERS = ["Company", "Role", "Status", "Applied", "Pay"];

const sheet = (rows: string[][]): Sheet => ({ headers: HEADERS, rows });

const MAPPING = {
    company: 0,
    role: 1,
    status: 2,
    appliedAt: 3,
    pay: 4,
} as const;

const NO_CHOICES: ValueChoices = { statuses: {}, arrangements: {} };

const build = (
    rows: string[][],
    options: {
        existing?: ReadonlyMap<string, ApplicationRow>;
        statuses?: Record<string, "applied" | "rejected">;
        defaultCurrency?: string;
        rates?: ExchangeRates;
    } = {},
): RowOutcome[] =>
    buildRows(
        sheet(rows),
        MAPPING,
        { ...NO_CHOICES, statuses: options.statuses ?? {} },
        "applied",
        options.existing ?? new Map(),
        options.defaultCurrency ?? "USD",
        options.rates ?? {},
    );

const kinds = (outcomes: RowOutcome[]) =>
    outcomes.map((outcome) => outcome.kind);

const existingRow = (fields: Partial<ApplicationRow> = {}): ApplicationRow => ({
    id: "1",
    company: "Anthropic",
    role: "Engineer",
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

describe("building rows", () => {
    test("reads a row into a draft", () => {
        const [outcome] = build([
            ["Anthropic", "Engineer", "Rejected", "2026-03-05", "$120k"],
        ]);
        expect(outcome).toMatchObject({
            kind: "ready",
            line: 2,
            draft: {
                company: "Anthropic",
                role: "Engineer",
                status: "rejected",
                appliedAt: "2026-03-05",
                pay: "$120k",
            },
        });
    });

    test("numbers a row by the line it sits on, header included", () => {
        const outcomes = build([
            ["Anthropic", "", "", "", ""],
            ["Vercel", "", "", "", ""],
        ]);
        expect(outcomes.map((outcome) => outcome.line)).toEqual([2, 3]);
    });

    test("keeps the good rows when a neighbour is unusable", () => {
        const outcomes = build([
            ["Anthropic", "", "", "", ""],
            ["", "Engineer", "", "", ""],
            ["Vercel", "", "", "", ""],
        ]);
        expect(kinds(outcomes)).toEqual(["ready", "invalid", "ready"]);
        expect(outcomes[1]).toMatchObject({
            kind: "invalid",
            reason: "Company is required.",
        });
    });

    test("drops a date it cannot read rather than the application", () => {
        const [outcome] = build([["Anthropic", "", "", "last tuesday", ""]]);
        expect(outcome).toMatchObject({
            kind: "ready",
            draft: { company: "Anthropic", appliedAt: null },
            dropped: ["appliedAt"],
        });
    });

    test("drops a column the row cannot store rather than the row", () => {
        // A link that is not a link costs the link, not the application.
        const outcomes = buildRows(
            {
                headers: ["Company", "Link"],
                rows: [["Anthropic", "not a url"]],
            },
            { company: 0, url: 1 },
            NO_CHOICES,
            "applied",
            new Map(),
            "USD",
            {},
        );
        expect(outcomes[0]).toMatchObject({
            kind: "ready",
            draft: { company: "Anthropic", url: null },
            dropped: ["url"],
        });
    });

    test("drops every refused column, not just the first one found", () => {
        const outcomes = buildRows(
            {
                headers: ["Company", "Link", "Applied"],
                rows: [["Anthropic", "not a url", "last tuesday"]],
            },
            { company: 0, url: 1, appliedAt: 2 },
            NO_CHOICES,
            "applied",
            new Map(),
            "USD",
            {},
        );
        expect(outcomes[0]).toMatchObject({ kind: "ready" });
        const outcome = outcomes[0];
        if (outcome.kind !== "ready") throw new Error("expected a ready row");
        expect([...outcome.dropped].sort()).toEqual(["appliedAt", "url"]);
    });

    test("a row that keeps every column reports nothing dropped", () => {
        const [outcome] = build([
            ["Anthropic", "Engineer", "Applied", "2026-03-05", "$120k"],
        ]);
        expect(outcome).toMatchObject({ kind: "ready", dropped: [] });
    });

    test("still refuses a row with no company, which nothing can stand in for", () => {
        const [outcome] = build([["", "Engineer", "", "", ""]]);
        expect(outcome).toMatchObject({
            kind: "invalid",
            reason: "Company is required.",
        });
    });

    test("passes over a blank line without counting it against the file", () => {
        const outcomes = build([
            ["Anthropic", "", "", "", ""],
            ["", "", "", "", ""],
        ]);
        expect(kinds(outcomes)).toEqual(["ready"]);
    });

    test("falls back for a status the sheet does not give", () => {
        const [outcome] = build([["Anthropic", "", "", "", ""]]);
        expect(outcome).toMatchObject({ draft: { status: "applied" } });
    });

    test("takes the user's answer over its own reading", () => {
        const [outcome] = build([["Anthropic", "", "Rejected", "", ""]], {
            statuses: { rejected: "applied" },
        });
        expect(outcome).toMatchObject({ draft: { status: "applied" } });
    });
});

describe("duplicates", () => {
    test("counts a row already in the list", () => {
        const outcomes = build([["Anthropic", "Engineer", "Applied", "", ""]], {
            existing: existingIndex([existingRow()]),
        });
        expect(outcomes[0]).toMatchObject({
            kind: "duplicate",
            against: "list",
        });
    });

    test("counts a row the file repeats", () => {
        const outcomes = build([
            ["Anthropic", "Engineer", "Applied", "", ""],
            ["Anthropic", "Engineer", "Applied", "", ""],
        ]);
        expect(kinds(outcomes)).toEqual(["ready", "duplicate"]);
        expect(outcomes[1]).toMatchObject({ against: "file" });
    });

    test("names the line it repeats, so the match can be looked at", () => {
        const outcomes = build([
            ["Anthropic", "Engineer", "Applied", "", ""],
            ["Vercel", "", "", "", ""],
            ["Anthropic", "Engineer", "Applied", "", ""],
        ]);
        // Line 2 is the first row, the header having taken line 1.
        expect(outcomes[2]).toMatchObject({ against: "file", firstLine: 2 });
    });

    test("carries the application it matched, not just that it matched one", () => {
        const existing = existingRow({ role: "Engineer" });
        const outcomes = build([["Anthropic", "Engineer", "Applied", "", ""]], {
            existing: existingIndex([existing]),
        });
        expect(outcomes[0]).toMatchObject({
            against: "list",
            existing: { id: existing.id, role: "Engineer" },
        });
    });

    test("sets case and spacing aside, which a sheet is rarely consistent about", () => {
        const outcomes = build(
            [["  anthropic ", "ENGINEER", "Applied", "", ""]],
            { existing: existingIndex([existingRow()]) },
        );
        expect(outcomes[0].kind).toBe("duplicate");
    });

    test("a single differing column makes it a different application", () => {
        const existing = existingIndex([existingRow()]);
        expect(
            build([["Anthropic", "Designer", "Applied", "", ""]], {
                existing,
            })[0].kind,
        ).toBe("ready");
        expect(
            build([["Anthropic", "Engineer", "Rejected", "", ""]], {
                existing,
            })[0].kind,
        ).toBe("ready");
        expect(
            build([["Anthropic", "Engineer", "Applied", "2026-03-05", ""]], {
                existing,
            })[0].kind,
        ).toBe("ready");
    });

    test("compares pay by what it parses to, not by how it was typed", () => {
        const existing = existingIndex([
            existingRow({
                payMin: "120000",
                payCurrency: "USD",
                // Read out of the figure on the way in, the same as the draft
                // below has it read out on the way through the preview.
                payPeriod: "yearly",
            }),
        ]);
        const outcomes = build(
            [["Anthropic", "Engineer", "Applied", "", "$120,000"]],
            { existing },
        );
        expect(outcomes[0].kind).toBe("duplicate");
    });

    // A figure typed without a currency is stored as the user's default, so the
    // preview has to read it the same way or it would offer to import a row the
    // list already holds.
    test("reads a figure with no currency as the user's default", () => {
        const existing = existingIndex([
            existingRow({ payMin: "120000", payCurrency: "CAD" }),
        ]);
        const outcomes = build(
            [["Anthropic", "Engineer", "Applied", "", "120,000"]],
            { existing, defaultCurrency: "CAD" },
        );
        expect(outcomes[0].kind).toBe("duplicate");
    });

    test("a currency on a row naming no figure does not tell two rows apart", () => {
        const existing = existingIndex([existingRow({ payCurrency: "EUR" })]);
        const outcomes = build([["Anthropic", "Engineer", "Applied", "", ""]], {
            existing,
        });
        expect(outcomes[0].kind).toBe("duplicate");
    });
});

describe("distinct values", () => {
    test("lists what a column says once each, in the order it first says it", () => {
        expect(
            distinctValues(
                sheet([
                    ["a", "", "Applied", "", ""],
                    ["b", "", "Rejected", "", ""],
                    ["c", "", "applied", "", ""],
                    ["d", "", "", "", ""],
                ]),
                2,
            ),
        ).toEqual(["Applied", "Rejected"]);
    });

    test("has nothing to ask about an unmapped column", () => {
        expect(
            distinctValues(sheet([["a", "", "", "", ""]]), undefined),
        ).toEqual([]);
    });
});
