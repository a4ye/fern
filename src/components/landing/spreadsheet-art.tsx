type Cell = {
    text: string;
    className?: string;
    selected?: boolean;
};

const LETTERS = ["", "A", "B", "C", "D", "E"];

const SHEET_ROWS: Cell[][] = [
    [
        { text: "Company", className: "font-medium text-ink" },
        { text: "Role", className: "font-medium text-ink" },
        { text: "Status", className: "font-medium text-ink" },
        { text: "Salary", className: "font-medium text-ink" },
        { text: "Updated", className: "font-medium text-ink" },
    ],
    [
        { text: "Stripe" },
        { text: "Platform Engineer" },
        { text: "Rejected?" },
        { text: "$160k" },
        { text: "Apr 30" },
    ],
    [
        { text: "Ramp" },
        { text: "Frontend Engineer" },
        { text: "Interview", selected: true },
        { text: "" },
        { text: "May 28" },
    ],
    [
        { text: "Vercel" },
        { text: "Frontend Engineer" },
        { text: "#REF!", className: "text-rose" },
        { text: "170k" },
        { text: "" },
    ],
    [{ text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }],
];

const cellVisibility = (col: number) => (col >= 3 ? "hidden sm:flex" : "flex");

const SHEET_GRID =
    "grid grid-cols-[2.25rem_minmax(0,1.1fr)_minmax(0,1.3fr)] sm:grid-cols-[2.25rem_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_4.5rem_4.5rem]";

export const SpreadsheetArt = () => (
    <div aria-hidden="true" className="border border-hairline bg-background">
        <div className="flex items-center gap-3 border-b border-hairline px-3 py-2">
            <span className="text-xs font-medium text-muted">fx</span>
            <span className="truncate text-xs text-sub">
                =IF(C4=&quot;&quot;, &quot;Applied?&quot;, C4)
            </span>
        </div>

        <div className={`${SHEET_GRID} border-b border-faint bg-surface`}>
            {LETTERS.map((letter, col) => (
                <span
                    key={col}
                    className={`${cellVisibility(col)} h-7 items-center justify-center border-r border-faint text-xs text-muted last:border-r-0`}
                >
                    {letter}
                </span>
            ))}
        </div>

        {SHEET_ROWS.map((row, rowIndex) => (
            <div
                key={rowIndex}
                className={`${SHEET_GRID} border-b border-faint last:border-b-0`}
            >
                <span className="flex h-8 items-center justify-center border-r border-faint bg-surface text-xs text-muted">
                    {rowIndex + 1}
                </span>
                {row.map((cell, col) => (
                    <span
                        key={col}
                        className={`${cellVisibility(col + 1)} relative h-8 min-w-0 items-center border-r border-faint px-2 last:border-r-0`}
                    >
                        <span
                            className={`truncate text-xs ${cell.className ?? "text-sub"}`}
                        >
                            {cell.text}
                        </span>
                        {cell.selected && (
                            <>
                                <span className="lp-caret ml-px h-3.5 w-px shrink-0 bg-ink" />
                                <span className="pointer-events-none absolute inset-0 border-2 border-accent" />
                                <span className="absolute -right-0.5 -bottom-0.5 z-10 size-1.5 border border-background bg-accent" />
                            </>
                        )}
                    </span>
                ))}
            </div>
        ))}
    </div>
);
