import { toDateInput, type Volume } from "@/components/dashboard/data";

export type ActivityRange = {
    start: string;
    end: string;
};

export type ActivityCell = {
    date: string;
    count: number;
    description: string;
    visible: boolean;
};

export type MonthMark = {
    column: number;
    label: string;
};

export type ActivityGrid = {
    cells: ActivityCell[];
    months: MonthMark[];
    weeks: number;
    range: string;
    total: number;
};

const dateFromInput = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
};

const startOfWeek = (date: Date) => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    return start;
};

const endOfWeek = (date: Date) => {
    const end = new Date(date);
    end.setDate(end.getDate() + (6 - end.getDay()));
    return end;
};

const MIN_LABEL_COLUMNS = 3;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const DAY = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
});
const RANGE_DAY = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

const descriptionFor = (date: Date, count: number) =>
    `${count} ${count === 1 ? "application" : "applications"} on ${DAY.format(date)}`;

// A fixed 365-day window has the same weekday at both ends. Padding those ends
// to full weeks therefore always produces the 53 columns users expect from a
// contribution graph.
export const trailingYearRange = (through: string): ActivityRange => {
    const end = dateFromInput(through);
    const start = new Date(end);
    start.setDate(start.getDate() - 364);
    return { start: toDateInput(start), end: through };
};

export const calendarYearRange = (year: number): ActivityRange => ({
    start: `${year}-01-01`,
    end: `${year}-12-31`,
});

// Calendar choices fill every year from the current one back to the list's
// first application, including quiet years. The rolling view remains a separate
// choice rather than standing in for the current calendar year.
export const calendarYearsFrom = (volume: Volume): number[] => {
    if (volume.days.length === 0) return [];

    const latest = dateFromInput(volume.through).getFullYear();
    const earliest = dateFromInput(volume.days[0].date).getFullYear();
    return Array.from(
        { length: Math.max(0, latest - earliest + 1) },
        (_, index) => latest - index,
    );
};

// Pads a selected range to complete Sunday-to-Saturday columns. Calendar days
// outside the range occupy their grid positions without drawing a square, just
// like the partial weeks at the ends of GitHub's graph.
export const activityGridFrom = (
    volume: Volume,
    range: ActivityRange,
): ActivityGrid => {
    const counts = new Map(volume.days.map((day) => [day.date, day.count]));
    const firstVisible = dateFromInput(range.start);
    const lastVisible = dateFromInput(range.end);
    const cursor = startOfWeek(firstVisible);
    const end = endOfWeek(lastVisible).getTime();
    const cells: ActivityCell[] = [];

    while (cursor.getTime() <= end) {
        const date = toDateInput(cursor);
        const visible = date >= range.start && date <= range.end;
        const count = visible ? (counts.get(date) ?? 0) : 0;
        cells.push({
            date,
            count,
            description: descriptionFor(cursor, count),
            visible,
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    const weeks = cells.length / 7;
    const months: MonthMark[] = [];
    for (let column = 0; column < weeks; column += 1) {
        const mark = cells
            .slice(column * 7, column * 7 + 7)
            .filter((cell) => cell.visible)
            .map((cell) => dateFromInput(cell.date))
            .find((date) => date.getDate() === 1);
        if (mark) months.push({ column, label: MONTH.format(mark) });
    }

    // A range that opens mid-month has no boundary to label, so the leading
    // column names that month itself. A label is about twice as wide as the
    // column it sits above, so it only earns the space when the next month
    // begins far enough along to clear it.
    if (months.length === 0 || months[0].column >= MIN_LABEL_COLUMNS) {
        months.unshift({ column: 0, label: MONTH.format(firstVisible) });
    }

    return {
        cells,
        months,
        weeks,
        range: `${RANGE_DAY.format(firstVisible)} to ${RANGE_DAY.format(lastVisible)}`,
        total: cells.reduce((sum, cell) => sum + cell.count, 0),
    };
};

export const activityLevel = (count: number) => Math.min(4, count);
