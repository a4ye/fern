import type { ReactNode } from "react";
import type {
    Sort,
    SortDirection,
    SortKey,
} from "@/components/dashboard/applications-view";

// Shared between the live table and its loading skeleton so both lay out on the
// same grid. The minimum width is what forces horizontal scrolling on narrow
// screens instead of crushed cells.
// Rows are a fixed height in every mode, so swapping read-only cells for input
// fields never changes the shape of the table. The measure is spelled out
// alongside the class because windowing has to count rows in the same unit the
// class draws them in; the two move together.
export const ROW_REM = 2.5;
export const ROW_HEIGHT = "h-10";

// Every full-width row shares this floor so the ones that leave the grid, like
// the delete confirmation, still span the whole scrolled width. It has to equal
// what the grid below cannot shrink past, or those rows stop short of the others
// once the table is scrolling: the ten column minimums (70.25rem) plus the nine
// 0.75rem gaps plus the row's own px-5, which comes to 79.5rem.
export const ROW_MIN_WIDTH = "min-w-[79.5rem]";

// Applied is wider than its "Jul 28" needs: in bulk edit it holds a native date
// field, and the browser's own picker glyph is what sets that floor. Pay holds
// the longest label the table can print, "USD 120,000–140,000/yr", and is sized
// to fit one rather than clip every range. The last column is three 2rem action
// squares, which is what keeps the glyphs off each other and off the row's edge.
export const APPLICATION_COLUMNS = `grid ${ROW_MIN_WIDTH} grid-cols-[1.75rem_minmax(9rem,1.6fr)_minmax(9rem,1.7fr)_8.5rem_minmax(7rem,1.2fr)_6.5rem_9.5rem_8rem_5rem_6rem] items-center gap-x-3`;

// The value columns in the order they are drawn, each with what it sorts by.
// The checkbox and the row actions are not values and so are not here.
const HEADINGS: { label: string; key: SortKey }[] = [
    { label: "Company", key: "company" },
    { label: "Role", key: "role" },
    { label: "Status", key: "status" },
    { label: "Location", key: "location" },
    { label: "Arrangement", key: "arrangement" },
    { label: "Pay", key: "pay" },
    { label: "Applied", key: "appliedAt" },
    { label: "Updated", key: "updatedAt" },
];

// Pulled out into the column gap by its own padding, so a heading that can be
// pressed sits on the same pixel as one that cannot. `group` belongs to the
// button alone: a heading with nothing behind it must not hint on hover.
const HEADING_CLASS = "-mx-1 flex min-w-0 items-center gap-1 px-1";

// What the next press does. A third one hands the table back to the order the
// rows were added in, which nothing on screen would otherwise say, so the
// heading carries it as a tooltip rather than the bar carrying a reset button.
const NEXT_ACTION: Record<string, string> = {
    none: "Sort ascending",
    asc: "Sort descending",
    desc: "Clear sort, back to the order added",
};

// One arrow, turned over for descending and faded out when the column is not
// the one in force. It keeps its space either way, so a heading does not shift
// as the sort moves off it, and a hint of it appears under the pointer to say
// the heading can be pressed at all.
const Heading = ({
    label,
    direction,
    onSort,
}: {
    label: string;
    direction: SortDirection | null;
    onSort?: () => void;
}) => {
    const arrow = (
        <span
            aria-hidden="true"
            className={`icon-[lucide--arrow-up] size-3 shrink-0 transition-[opacity,transform] ${direction === "desc" ? "rotate-180" : ""} ${
                direction
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40"
            }`}
        />
    );

    if (!onSort) {
        return (
            <span className={HEADING_CLASS}>
                <span className="truncate">{label}</span>
                {arrow}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={onSort}
            title={NEXT_ACTION[direction ?? "none"]}
            aria-label={`${label}, ${NEXT_ACTION[direction ?? "none"].toLowerCase()}`}
            className={`${HEADING_CLASS} group cursor-pointer text-left transition-colors hover:text-ink focus-visible:outline-1 focus-visible:outline-accent ${direction ? "text-ink" : ""}`}
        >
            <span className="truncate">{label}</span>
            {arrow}
        </button>
    );
};

export const ApplicationsHeaderRow = ({
    selectAll,
    sort = null,
    onSort,
}: {
    selectAll?: ReactNode;
    sort?: Sort | null;
    onSort?: (key: SortKey) => void;
}) => (
    <div
        className={`${APPLICATION_COLUMNS} sticky top-0 z-20 border-b border-hairline bg-background px-5 py-2 text-xs font-medium text-muted`}
    >
        <span className="flex items-center">{selectAll}</span>
        {HEADINGS.map(({ label, key }) => (
            <Heading
                key={key}
                label={label}
                direction={sort?.key === key ? sort.direction : null}
                onSort={onSort && (() => onSort(key))}
            />
        ))}
        <span className="sr-only">Actions</span>
    </div>
);
