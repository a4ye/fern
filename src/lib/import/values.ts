// Turning what a sheet says into the values the columns hold. Everything here
// is a guess the import step shows the user before anything is written, so an
// unmatched value is left null for them to settle rather than forced onto the
// nearest enum member.

import {
    STATUS_KEYWORDS,
    STATUS_META,
    arrangementLabel,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import { containsMatch, searchScore } from "@/lib/fuzzy";

const STATUSES = Object.keys(STATUS_META) as ApplicationStatus[];

// Same gate as the column matcher: a value has to be written into the label or
// one of its keywords, not merely scattered through it.
const best = <T>(
    raw: string,
    candidates: readonly T[],
    namesOf: (value: T) => readonly string[],
): T | null => {
    const query = raw.trim();
    if (!query) return null;

    let winner: T | null = null;
    let winningScore = 0;
    for (const candidate of candidates) {
        const [label, ...rest] = namesOf(candidate);
        const written =
            containsMatch(query, label) ||
            rest.some((name) => containsMatch(query, name));
        if (!written) continue;

        const score = searchScore(query, label, rest);
        if (score > winningScore) {
            winningScore = score;
            winner = candidate;
        }
    }
    return winner;
};

export const matchStatus = (raw: string): ApplicationStatus | null =>
    best(raw, STATUSES, (status) => [
        STATUS_META[status].label,
        ...STATUS_KEYWORDS[status],
    ]);

const ARRANGEMENTS: Arrangement[] = ["remote", "hybrid", "onsite"];

const ARRANGEMENT_KEYWORDS: Record<Arrangement, string[]> = {
    remote: [
        "remote",
        "wfh",
        "work from home",
        "from home",
        "virtual",
        "anywhere",
        "distributed",
        "telecommute",
    ],
    hybrid: ["hybrid", "flex", "flexible", "partly remote", "mixed", "split"],
    onsite: [
        "onsite",
        "on site",
        "in office",
        "in person",
        "office",
        "local",
        "in house",
    ],
};

export const matchArrangement = (raw: string): Arrangement | null =>
    best(raw, ARRANGEMENTS, (arrangement) => [
        arrangementLabel(arrangement),
        ...ARRANGEMENT_KEYWORDS[arrangement],
    ]);

const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

const monthFromName = (name: string): number | null => {
    const wanted = name.toLowerCase();
    const index = MONTHS.findIndex((month) => month.startsWith(wanted));
    return index === -1 ? null : index + 1;
};

const pad = (value: number) => String(value).padStart(2, "0");

const asDay = (year: number, month: number, day: number): string | null => {
    // A day the calendar does not have, like the 31st of a 30-day month, is a
    // misread rather than a date, so it is refused instead of rolling forward.
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
};

// Two digits are a century short. Anything up to the sixties reads as this
// century, which keeps a job applied for in '26 out of 1926.
const fullYear = (value: number) =>
    value >= 100 ? value : value < 70 ? 2000 + value : 1900 + value;

export type DateOrder = "mdy" | "dmy";

const NUMERIC_DAY = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/;

// A sheet is written in one place, so the column settles the order rather than
// the row. One value with a leading part above twelve reads the whole column as
// day-first, which is the only evidence a file carries about where it was
// written. Without it the American order wins, being the one job boards use.
export const detectDateOrder = (values: readonly string[]): DateOrder => {
    for (const value of values) {
        const parts = value.trim().match(NUMERIC_DAY);
        if (!parts) continue;
        const [, first, second] = parts;
        // A leading four-digit year is unambiguous and says nothing about the
        // order of the two parts behind it.
        if (first.length === 4) continue;
        if (Number(first) > 12) return "dmy";
        if (Number(second) > 12) return "mdy";
    }
    return "mdy";
};

const MONTH_FIRST = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i;
const DAY_FIRST = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{2,4})$/i;

// Returns yyyy-mm-dd, or null for a cell that does not read as a date. A cell
// holding something unreadable is reported against its row rather than quietly
// dropped: losing the day someone applied is not a detail.
export const parseDay = (
    raw: string,
    order: DateOrder = "mdy",
): string | null => {
    const value = raw.trim();
    if (!value) return null;

    const numeric = value.match(NUMERIC_DAY);
    if (numeric) {
        const [, first, second, third] = numeric;
        if (first.length === 4) {
            return asDay(Number(first), Number(second), Number(third));
        }
        const year = fullYear(Number(third));
        return order === "dmy"
            ? asDay(year, Number(second), Number(first))
            : asDay(year, Number(first), Number(second));
    }

    const monthFirst = value.match(MONTH_FIRST);
    if (monthFirst) {
        const month = monthFromName(monthFirst[1]);
        return month === null
            ? null
            : asDay(
                  fullYear(Number(monthFirst[3])),
                  month,
                  Number(monthFirst[2]),
              );
    }

    const dayFirst = value.match(DAY_FIRST);
    if (dayFirst) {
        const month = monthFromName(dayFirst[2]);
        return month === null
            ? null
            : asDay(fullYear(Number(dayFirst[3])), month, Number(dayFirst[1]));
    }

    return null;
};
