import { describe, expect, test } from "bun:test";
import {
    NO_ARRANGEMENT,
    NO_FILTERS,
    applicationsView,
    nextSort,
    type Filters,
    type SortKey,
} from "@/components/dashboard/applications-view";
import type { ApplicationRow } from "@/components/dashboard/data";

const app = (
    company: string,
    fields: Partial<ApplicationRow> = {},
): ApplicationRow => ({
    id: company,
    company,
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
});

const order = (
    rows: ApplicationRow[],
    key: SortKey,
    direction: "asc" | "desc" = "asc",
): string[] =>
    applicationsView(rows, NO_FILTERS, { key, direction }).rows.map(
        (row) => row.company,
    );

const found = (rows: ApplicationRow[], filters: Partial<Filters>): string[] =>
    applicationsView(rows, { ...NO_FILTERS, ...filters }, null).rows.map(
        (row) => row.company,
    );

describe("sorting", () => {
    test("orders text by label and keeps blanks at the bottom either way", () => {
        const rows = [app("Vercel"), app(""), app("Anthropic")];
        expect(order(rows, "company")).toEqual(["Anthropic", "Vercel", ""]);
        expect(order(rows, "company", "desc")).toEqual([
            "Vercel",
            "Anthropic",
            "",
        ]);
    });

    test("reads numbers inside a role as numbers", () => {
        const rows = [
            app("a", { role: "Engineer 10" }),
            app("b", { role: "Engineer 2" }),
        ];
        expect(order(rows, "role")).toEqual(["b", "a"]);
    });

    test("orders status by pipeline stage, not by its label", () => {
        const rows = [
            app("ghosted", { status: "ghosted" }),
            app("accepted", { status: "offer_accepted" }),
            app("applied", { status: "applied" }),
        ];
        expect(order(rows, "status")).toEqual([
            "applied",
            "accepted",
            "ghosted",
        ]);
    });

    test("orders arrangement remote to onsite, unset last", () => {
        const rows = [
            app("onsite", { arrangement: "onsite" }),
            app("unset"),
            app("remote", { arrangement: "remote" }),
        ];
        expect(order(rows, "arrangement")).toEqual([
            "remote",
            "onsite",
            "unset",
        ]);
        expect(order(rows, "arrangement", "desc")).toEqual([
            "onsite",
            "remote",
            "unset",
        ]);
    });

    test("puts pay on one clock before comparing it", () => {
        const rows = [
            app("monthly", { payMin: "9000.00", payPeriod: "monthly" }),
            app("hourly", { payMin: "60.00", payPeriod: "hourly" }),
            app("yearly", { payMin: "115000.00", payPeriod: "yearly" }),
        ];
        // 108,000 a year, 124,800 a year, 115,000 a year.
        expect(order(rows, "pay")).toEqual(["monthly", "yearly", "hourly"]);
    });

    test("sorts a pay range by the end the cell leads with", () => {
        const rows = [
            app("wide", {
                payMin: "100000.00",
                payMax: "200000.00",
                payPeriod: "yearly",
            }),
            app("flat", { payMin: "150000.00", payPeriod: "yearly" }),
        ];
        expect(order(rows, "pay")).toEqual(["wide", "flat"]);
    });

    test("leaves pay written as a note at the bottom", () => {
        const rows = [
            app("note", { payNote: "competitive" }),
            app("amount", { payMin: "1.00", payPeriod: "yearly" }),
        ];
        expect(order(rows, "pay")).toEqual(["amount", "note"]);
        expect(order(rows, "pay", "desc")).toEqual(["amount", "note"]);
    });

    test("orders applied dates chronologically, unset last", () => {
        const rows = [
            app("later", { appliedAt: "2026-02-01" }),
            app("never"),
            app("earlier", { appliedAt: "2025-12-24" }),
        ];
        expect(order(rows, "appliedAt")).toEqual(["earlier", "later", "never"]);
    });

    test("orders updated by the timestamp, not by the label it prints", () => {
        const rows = [
            app("older", {
                updated: "3w ago",
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
            app("newer", {
                updated: "2h ago",
                updatedAt: "2026-01-22T00:00:00.000Z",
            }),
        ];
        expect(order(rows, "updatedAt")).toEqual(["older", "newer"]);
    });

    test("keeps rows a column cannot tell apart in the order they came", () => {
        const rows = [app("second"), app("first"), app("third")];
        expect(order(rows, "status")).toEqual(["second", "first", "third"]);
    });

    test("walks a header from ascending to descending to no sort", () => {
        const first = nextSort(null, "company");
        expect(first).toEqual({ key: "company", direction: "asc" });
        const second = nextSort(first, "company");
        expect(second).toEqual({ key: "company", direction: "desc" });
        expect(nextSort(second, "company")).toBeNull();
        expect(nextSort(second, "pay")).toEqual({
            key: "pay",
            direction: "asc",
        });
    });
});

describe("searching", () => {
    const rows = [
        app("Google", { role: "Software Engineer Intern" }),
        app("Stripe", { role: "Backend Engineer", location: "Toronto" }),
        app("Shopify", { status: "online_assessment" }),
    ];

    test("matches a word anywhere in the row", () => {
        expect(found(rows, { query: "toronto" })).toEqual(["Stripe"]);
        expect(found(rows, { query: "engineer" })).toEqual([
            "Google",
            "Stripe",
        ]);
    });

    test("lets each word land in a different column", () => {
        expect(found(rows, { query: "google intern" })).toEqual(["Google"]);
        expect(found(rows, { query: "stripe intern" })).toEqual([]);
    });

    test("finds a row by the status label it prints", () => {
        expect(found(rows, { query: "assessment" })).toEqual(["Shopify"]);
    });

    test("does not match letters merely scattered through a row", () => {
        expect(found(rows, { query: "sfy" })).toEqual([]);
    });

    test("shows everything when the box is empty", () => {
        expect(found(rows, { query: "   " })).toHaveLength(3);
    });
});

describe("filtering", () => {
    const rows = [
        app("a", { status: "applied", arrangement: "remote" }),
        app("b", { status: "rejected", arrangement: "remote" }),
        app("c", { status: "applied" }),
    ];

    test("keeps rows holding any of the chosen values", () => {
        expect(found(rows, { statuses: ["applied"] })).toEqual(["a", "c"]);
        expect(found(rows, { statuses: ["applied", "rejected"] })).toEqual([
            "a",
            "b",
            "c",
        ]);
    });

    test("filters for an arrangement nobody set", () => {
        expect(found(rows, { arrangements: [NO_ARRANGEMENT] })).toEqual(["c"]);
    });

    test("narrows by both facets at once", () => {
        expect(
            found(rows, { statuses: ["applied"], arrangements: ["remote"] }),
        ).toEqual(["a"]);
    });

    test("counts a value as what ticking it would add", () => {
        const view = applicationsView(
            rows,
            { ...NO_FILTERS, statuses: ["applied"] },
            null,
        );
        // Rejected is filtered out, and its count still says what it holds.
        expect(view.statusCounts.get("rejected")).toBe(1);
        expect(view.statusCounts.get("applied")).toBe(2);
        // The arrangements are counted through the status filter above.
        expect(view.arrangementCounts.get("remote")).toBe(1);
        expect(view.arrangementCounts.get(NO_ARRANGEMENT)).toBe(1);
    });

    test("counts through the search box, which is not a facet", () => {
        const view = applicationsView(
            rows,
            { ...NO_FILTERS, query: "b" },
            null,
        );
        expect(view.statusCounts.get("rejected")).toBe(1);
        expect(view.statusCounts.get("applied")).toBeUndefined();
    });
});
