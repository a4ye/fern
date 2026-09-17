const ROW_HEIGHT = 40;

const COLUMNS = [
    { letter: "A", header: "Employer" },
    { letter: "B", header: "Date applied" },
    { letter: "C", header: "Job title" },
    { letter: "D", header: "Comp" },
    { letter: "E", header: "Stage" },
];

const FIELDS = [
    { label: "Company", value: "Ramp" },
    { label: "Role", value: "Frontend Engineer" },
    { label: "Status", value: "Interview" },
    { label: "Pay", value: "$62 per hour" },
    { label: "Applied", value: "May 20" },
];

// Which field each column feeds. The two sides are in different orders on
// purpose: a spreadsheet keeps its own, and the match is on the header text.
const MATCHES = [0, 4, 1, 3, 2];

const CONNECTOR_WIDTH = 96;
const PANEL_HEIGHT = COLUMNS.length * ROW_HEIGHT;

const centre = (index: number) => index * ROW_HEIGHT + ROW_HEIGHT / 2;

export const ImportMap = () => (
    <div aria-hidden="true">
        <div className="hidden grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] items-center md:grid">
            <div>
                <p className="mb-2 text-xs font-medium text-muted">
                    Your columns
                </p>
                <div className="border border-hairline bg-surface">
                    {COLUMNS.map((column) => (
                        <div
                            key={column.letter}
                            className="flex h-10 items-center gap-3 border-b border-faint px-3 last:border-b-0"
                        >
                            <span className="text-xs text-muted">
                                {column.letter}
                            </span>
                            <span className="truncate text-sm font-medium">
                                {column.header}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <svg
                width={CONNECTOR_WIDTH}
                height={PANEL_HEIGHT}
                viewBox={`0 0 ${CONNECTOR_WIDTH} ${PANEL_HEIGHT}`}
                className="mt-6"
            >
                {MATCHES.map((field, column) => {
                    const d = `M0 ${centre(column)} C 38 ${centre(column)}, 58 ${centre(field)}, ${CONNECTOR_WIDTH} ${centre(field)}`;
                    return (
                        <g key={column}>
                            <path
                                d={d}
                                fill="none"
                                stroke="var(--color-tile-border)"
                                strokeWidth={1}
                            />
                            <path
                                d={d}
                                fill="none"
                                stroke="var(--color-accent)"
                                strokeWidth={1}
                                pathLength={1}
                                style={{
                                    animationDelay: `${column * 260}ms`,
                                }}
                                className="link-draw"
                            />
                        </g>
                    );
                })}
            </svg>

            <div>
                <p className="mb-2 text-xs font-medium text-muted">Fields</p>
                <div className="border border-hairline bg-background">
                    {FIELDS.map((field) => (
                        <div
                            key={field.label}
                            className="flex h-10 items-center gap-3 border-b border-faint px-3 last:border-b-0"
                        >
                            <span className="flex-1 truncate text-sm font-medium">
                                {field.label}
                            </span>
                            <span className="truncate text-xs text-muted">
                                {field.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <div className="border border-hairline md:hidden">
            {MATCHES.map((field, column) => (
                <div
                    key={column}
                    className="flex items-center gap-3 border-b border-faint px-3 py-2.5 last:border-b-0"
                >
                    <span className="min-w-0 flex-1 truncate text-sm text-sub">
                        {COLUMNS[column].header}
                    </span>
                    <span className="icon-[lucide--arrow-right] size-3 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {FIELDS[field].label}
                    </span>
                </div>
            ))}
        </div>
    </div>
);
