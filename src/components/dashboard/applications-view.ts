// What the applications table shows: which rows, in what order. Kept out of the
// component because the judgements here are the ones worth checking, and an
// hourly rate against a salary or a stage against a later stage is answered in
// a test rather than by reading a screenshot.

import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    STATUS_META,
    arrangementLabel,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
    type PayPeriod,
} from "@/components/dashboard/data";
import { containsMatch } from "@/lib/fuzzy";

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
// one-off, are taken as written: a bare number in this field is almost always
// a yearly one.
// Every figure here but the first is calendar arithmetic. The hourly one is a
// judgement: a rate is read as a 40-hour week of a 52-week year, which is right
// for full-time work and overstates part-time work by whatever fraction of
// those hours it actually runs. An application has nowhere to record its hours,
// so this stands in for asking.
const PER_YEAR: Record<PayPeriod, number> = {
    hourly: 40 * 52,
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    yearly: 1,
    one_time: 1,
};

// The low end is the figure the cell leads with, so it is what the column reads
// by. Currencies are compared as written, there being no rate here to convert
// them; within one currency, which is how a list is nearly always kept, the
// order is exact.
const annualPay = (app: ApplicationRow): number | null => {
    const amount = app.payMin ?? app.payMax;
    if (amount === null) return null;
    return Number(amount) * (app.payPeriod ? PER_YEAR[app.payPeriod] : 1);
};

const sortValue = (
    app: ApplicationRow,
    key: SortKey,
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
            return annualPay(app);
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
// through the label the row prints, so typing what you can see finds it.
const fieldsOf = (app: ApplicationRow): string[] => [
    app.company,
    app.role ?? "",
    app.location ?? "",
    app.pay ?? "",
    STATUS_META[app.status].label,
    app.arrangement ? arrangementLabel(app.arrangement) : "",
];

// Each word has to land somewhere, though not all of them in the same column,
// so "google intern" finds the row whose company holds one and role the other.
const matchesQuery = (app: ApplicationRow, query: string): boolean => {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const fields = fieldsOf(app);
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
// search box is not a facet and narrows both.
export const applicationsView = (
    applications: ApplicationRow[],
    filters: Filters,
    sort: Sort | null,
): ApplicationsView => {
    const byStatus = (app: ApplicationRow) =>
        filters.statuses.length === 0 || filters.statuses.includes(app.status);
    const byArrangement = (app: ApplicationRow) =>
        filters.arrangements.length === 0 ||
        filters.arrangements.includes(app.arrangement ?? NO_ARRANGEMENT);

    const searched = applications.filter((app) =>
        matchesQuery(app, filters.query),
    );
    const rows = searched.filter((app) => byStatus(app) && byArrangement(app));

    return {
        // Sorting is stable, so rows a column cannot tell apart keep the order
        // they were added in rather than shuffling on every press.
        rows: sort
            ? [...rows].sort((first, second) =>
                  compare(
                      sortValue(first, sort.key),
                      sortValue(second, sort.key),
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
