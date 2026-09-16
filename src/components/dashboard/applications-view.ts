// What the applications table shows: which rows, in what order. Kept out of the
// component because the judgements here are the ones worth checking, and an
// hourly rate against a salary or a stage against a later stage is answered in
// a test rather than by reading a screenshot.

import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    STATUS_META,
    arrangementLabel,
    formatPay,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import { containsMatch } from "@/lib/fuzzy";
import {
    RATE_BASE,
    convertAmount,
    inBaseCurrency,
    type ExchangeRates,
} from "@/lib/exchange";
import { PER_YEAR } from "@/lib/pay";

export type SortKey =
    | "company"
    | "role"
    | "status"
    | "location"
    | "arrangement"
    | "pay"
    | "appliedAt"
    | "updatedAt";

export type SortDirection = "asc" | "desc";

export type Sort = { key: SortKey; direction: SortDirection };

// A press on a header walks this cycle, so the control that enters a sort is
// also the way out of one, back to the order the rows were added in. Every
// column opens ascending, whatever it holds: a column that guessed at which end
// you wanted would be right half the time and surprising the other half.
export const nextSort = (current: Sort | null, key: SortKey): Sort | null => {
    if (current?.key !== key) return { key, direction: "asc" };
    return current.direction === "asc" ? { key, direction: "desc" } : null;
};

// Statuses are ordered by where they sit in the pipeline, not by their labels:
// a column of stages is read for how far along things are, and the alphabet
// puts "Ghosted" ahead of "Offer accepted".
const STATUS_RANK = new Map(
    APPLICATION_STATUSES.map((status, index) => [status, index] as const),
);

const ARRANGEMENT_RANK = new Map(
    ARRANGEMENTS.map((arrangement, index) => [arrangement, index] as const),
);

// A rate compares against another only once both are on the same clock, so
// everything is carried up to a year first. An amount with no period, and a
// one-off, are taken as written. A figure whose period could be read from its
// size carries one by the time it is stored, so what is left here is a figure
// nothing could settle, and a year is where it sorts least oddly.
//
// The low end is the figure the cell leads with, so it is what the column reads
// by. Once on a yearly clock it is carried into one currency as well, since a
// number and a number are only ever comparable in the same money. A row the
// rates cannot cover sorts where an empty cell sorts, at the bottom: no order
// at all beats an order built on a currency this app has guessed the size of.
const annualPay = (
    app: ApplicationRow,
    rates: ExchangeRates,
): number | null => {
    const amount = app.payMin ?? app.payMax;
    if (amount === null) return null;
    const yearly =
        Number(amount) * (app.payPeriod ? PER_YEAR[app.payPeriod] : 1);
    return inBaseCurrency(yearly, app.payCurrency || RATE_BASE, rates);
};

// The same range written in one currency, for a column read down rather than a
// row read across. Null wherever there is nothing to rewrite: a row with no
// amounts, one already in that money, or one whose currency the rates do not
// cover. The caller prints what the row actually says in all three cases.
//
// Rounded to whole units, a cent carried over a rate published yesterday being
// a precision the number never had. Nothing on the figure itself says it was
// converted, so the control that asked for it names the currency it is in and
// the cell hangs the amount on record on hover.
export const payInCurrency = (
    app: ApplicationRow,
    currency: string,
    rates: ExchangeRates,
): string | null => {
    const from = app.payCurrency || RATE_BASE;
    if (from === currency) return null;

    const converted = (amount: string | null): string | null => {
        if (amount === null) return null;
        const value = convertAmount(Number(amount), from, currency, rates);
        return value === null ? null : String(Math.round(value));
    };

    const payMin = converted(app.payMin);
    const payMax = converted(app.payMax);
    if (payMin === null && payMax === null) return null;

    return formatPay({
        payMin,
        payMax,
        payCurrency: currency,
        payPeriod: app.payPeriod,
        payNote: null,
    });
};

const sortValue = (
    app: ApplicationRow,
    key: SortKey,
    rates: ExchangeRates,
): string | number | null => {
    switch (key) {
        case "company":
            return app.company || null;
        case "role":
            return app.role || null;
        case "status":
            return STATUS_RANK.get(app.status) ?? null;
        case "location":
            return app.location || null;
        case "arrangement":
            return app.arrangement === null
                ? null
                : (ARRANGEMENT_RANK.get(app.arrangement) ?? null);
        case "pay":
            return annualPay(app, rates);
        case "appliedAt":
            return app.appliedAt;
        case "updatedAt":
            return Date.parse(app.updatedAt);
    }
};

// Numbers inside text are read as numbers, so "Engineer 2" comes before
// "Engineer 10". Built once and reused: `localeCompare` with options of its own
// builds one of these on every call, which is the whole cost of a text sort.
const COLLATOR = new Intl.Collator(undefined, {
    sensitivity: "base",
    numeric: true,
});

// Empty cells stay at the bottom whichever way a column is turned, as they do
// in a spreadsheet: a sort is asked for to see one end or the other, and a run
// of blanks at the top buries the answer.
const compare = (
    first: string | number | null,
    second: string | number | null,
    direction: SortDirection,
): number => {
    if (first === null) return second === null ? 0 : 1;
    if (second === null) return -1;
    const order =
        typeof first === "number" && typeof second === "number"
            ? first - second
            : COLLATOR.compare(String(first), String(second));
    return direction === "asc" ? order : -order;
};

// Arrangement is the one filtered field that can be unset, and having no value
// is as much a thing to look for as the values are, so it travels as one.
export const NO_ARRANGEMENT = "none";

export type ArrangementValue = Arrangement | typeof NO_ARRANGEMENT;

// An empty list means the facet is not filtering, rather than filtering
// everything out: a menu with nothing ticked is one nobody has touched.
export type Filters = {
    query: string;
    statuses: ApplicationStatus[];
    arrangements: ArrangementValue[];
};

export const NO_FILTERS: Filters = {
    query: "",
    statuses: [],
    arrangements: [],
};

// The search box shows its own text, so only the menu's choices are counted on
// the button that opens it.
export const activeFilterCount = (filters: Filters): number =>
    filters.statuses.length + filters.arrangements.length;

export const isFiltered = (filters: Filters): boolean =>
    filters.query.trim() !== "" || activeFilterCount(filters) > 0;

// Every column a row can be found by. Status and arrangement are searched
// through the label the row prints, so typing what you can see finds it. Pay is
// searched by both the figure on record and the converted one, so a column
// showing one currency is still searchable by the other.
const fieldsOf = (app: ApplicationRow, converted: string | null): string[] => [
    app.company,
    app.role ?? "",
    app.location ?? "",
    app.pay ?? "",
    converted ?? "",
    STATUS_META[app.status].label,
    app.arrangement ? arrangementLabel(app.arrangement) : "",
];

// Each word has to land somewhere, though not all of them in the same column,
// so "google intern" finds the row whose company holds one and role the other.
const matchesQuery = (
    app: ApplicationRow,
    query: string,
    converted: string | null,
): boolean => {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const fields = fieldsOf(app, converted);
    return terms.every((term) =>
        fields.some((field) => containsMatch(term, field)),
    );
};

const tally = <T>(
    rows: ApplicationRow[],
    valueOf: (app: ApplicationRow) => T,
): Map<T, number> => {
    const counts = new Map<T, number>();
    for (const row of rows) {
        const value = valueOf(row);
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
};

export type ApplicationsView = {
    rows: ApplicationRow[];
    statusCounts: Map<ApplicationStatus, number>;
    arrangementCounts: Map<ArrangementValue, number>;
};

// The count beside a value leaves that facet's own choices out, so it reads as
// what ticking the box would add rather than as what is already on screen. The
// search box is not a facet and narrows both. `convertTo` is the currency the
// pay column is being read in, or null while every row is read as written.
export const applicationsView = (
    applications: ApplicationRow[],
    filters: Filters,
    sort: Sort | null,
    rates: ExchangeRates,
    convertTo: string | null = null,
): ApplicationsView => {
    const byStatus = (app: ApplicationRow) =>
        filters.statuses.length === 0 || filters.statuses.includes(app.status);
    const byArrangement = (app: ApplicationRow) =>
        filters.arrangements.length === 0 ||
        filters.arrangements.includes(app.arrangement ?? NO_ARRANGEMENT);

    const searched = applications.filter((app) =>
        matchesQuery(
            app,
            filters.query,
            convertTo && payInCurrency(app, convertTo, rates),
        ),
    );
    const rows = searched.filter((app) => byStatus(app) && byArrangement(app));

    return {
        // Sorting is stable, so rows a column cannot tell apart keep the order
        // they were added in rather than shuffling on every press.
        rows: sort
            ? [...rows].sort((first, second) =>
                  compare(
                      sortValue(first, sort.key, rates),
                      sortValue(second, sort.key, rates),
                      sort.direction,
                  ),
              )
            : rows,
        statusCounts: tally(
            searched.filter(byArrangement),
            (app) => app.status,
        ),
        arrangementCounts: tally(
            searched.filter(byStatus),
            (app) => app.arrangement ?? NO_ARRANGEMENT,
        ),
    };
};
