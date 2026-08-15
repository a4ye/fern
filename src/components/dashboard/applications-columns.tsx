import type { ReactNode } from "react";

// Shared between the live table and its loading skeleton so both lay out on the
// same grid. The minimum width is what forces horizontal scrolling on narrow
// screens instead of crushed cells.
// Rows are a fixed height in every mode, so swapping read-only cells for input
// fields never changes the shape of the table.
export const ROW_HEIGHT = "h-10";

// Every full-width row shares this floor so the ones that leave the grid, like
// the delete confirmation, still span the whole scrolled width.
export const ROW_MIN_WIDTH = "min-w-[76rem]";

// Applied is wider than its "Jul 28" needs: in bulk edit it holds a native date
// field, and the browser's own picker glyph is what sets that floor. Pay holds
// the longest label the table can print, "USD 120,000–140,000/yr", and is sized
// to fit one rather than clip every range.
export const APPLICATION_COLUMNS = `grid ${ROW_MIN_WIDTH} grid-cols-[1.75rem_minmax(9rem,1.6fr)_minmax(9rem,1.7fr)_8.5rem_minmax(7rem,1.2fr)_6.5rem_9.5rem_8rem_5rem_4.5rem] items-center gap-x-3`;

export const ApplicationsHeaderRow = ({
    selectAll,
}: {
    selectAll?: ReactNode;
}) => (
    <div
        className={`${APPLICATION_COLUMNS} sticky top-0 z-20 border-b border-hairline bg-background px-5 py-2 text-xs font-medium text-muted`}
    >
        <span className="flex items-center">{selectAll}</span>
        <span>Company</span>
        <span>Role</span>
        <span>Status</span>
        <span>Location</span>
        <span>Arrangement</span>
        <span>Pay</span>
        <span>Applied</span>
        <span>Updated</span>
        <span className="sr-only">Actions</span>
    </div>
);
