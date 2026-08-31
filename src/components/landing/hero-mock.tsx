const GRID =
    "grid grid-cols-[minmax(0,1.6fr)_5.5rem] items-center gap-3 px-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_5.5rem_3.5rem_3.5rem]";

const ROWS = [
    {
        company: "Vercel",
        role: "Frontend Engineer",
        stage: "Interview",
        stageClass: "text-accent-deep",
        salary: "$170k",
        added: "May 12",
    },
    {
        company: "Anthropic",
        role: "Product Engineer",
        stage: "Offer",
        stageClass: "text-gold",
        salary: "$210k",
        added: "Apr 28",
    },
    {
        company: "Linear",
        role: "Design Engineer",
        stage: "Applied",
        stageClass: "text-sub",
        salary: "$145k",
        added: "May 20",
    },
    {
        company: "Stripe",
        role: "Platform Engineer",
        stage: "Rejected",
        stageClass: "text-rose",
        salary: "$160k",
        added: "Apr 15",
    },
];

const MonogramTile = ({
    letter,
    className = "",
}: {
    letter: string;
    className?: string;
}) => (
    <span
        className={`flex size-6 shrink-0 items-center justify-center border border-tile-border bg-background text-xs font-medium text-accent ${className}`}
    >
        {letter}
    </span>
);

export const HeroMock = ({
    emailSyncPromotionEnabled,
}: {
    emailSyncPromotionEnabled: boolean;
}) => (
    <div
        aria-hidden="true"
        className="relative border border-hairline bg-background shadow-2xl shadow-ink/10"
    >
        <div className="h-0.75 bg-accent" />

        <div className="flex h-10 items-center border-b border-hairline px-4">
            <span className="text-xs font-medium text-ink">Applications</span>
        </div>

        <div className="flex h-11 items-center gap-2.5 border-b border-hairline bg-surface px-4">
            <span className="icon-[lucide--link] size-3.5 shrink-0 text-muted" />
            <span className="flex min-w-0 items-center">
                <span className="lp lp-url inline-block overflow-hidden text-sm whitespace-nowrap text-ink">
                    jobs.ashbyhq.com/ramp/frontend-engineer
                </span>
                <span className="lp-caret ml-px h-4 w-px shrink-0 bg-accent" />
            </span>
        </div>

        <div className={`${GRID} border-b border-hairline py-2`}>
            <span className="text-xs font-medium text-muted">Company</span>
            <span className="hidden text-xs font-medium text-muted sm:block">
                Role
            </span>
            <span className="text-xs font-medium text-muted">Stage</span>
            <span className="hidden text-xs font-medium text-muted sm:block">
                Pay
            </span>
            <span className="hidden text-xs font-medium text-muted sm:block">
                Added
            </span>
        </div>

        <div className="divide-y divide-faint">
            <div
                className={`${emailSyncPromotionEnabled ? "lp lp-row-flash " : ""}${GRID} py-2.5`}
            >
                <span className="flex min-w-0 items-center gap-2.5">
                    <MonogramTile letter="R" className="lp lp-tile" />
                    <span className="lp lp-cell-1 truncate text-sm font-medium">
                        Ramp
                    </span>
                </span>
                <span className="lp lp-cell-2 hidden truncate text-sm text-sub sm:block">
                    Frontend Engineer
                </span>
                <span className={emailSyncPromotionEnabled ? "relative" : ""}>
                    {emailSyncPromotionEnabled ? (
                        <>
                            <span className="lp lp-chip-applied text-sm font-medium text-sub opacity-0">
                                Applied
                            </span>
                            <span className="lp lp-chip-interview absolute top-0 left-0 text-sm font-medium text-accent-deep">
                                Interview
                            </span>
                        </>
                    ) : (
                        <span className="lp lp-cell-3 text-sm font-medium text-sub">
                            Applied
                        </span>
                    )}
                </span>
                <span className="lp lp-cell-3 hidden text-sm text-sub tabular-nums sm:block">
                    $180k
                </span>
                <span className="lp lp-cell-4 hidden text-xs text-muted sm:block">
                    Today
                </span>
            </div>

            {ROWS.map((row) => (
                <div key={row.company} className={`${GRID} py-2.5`}>
                    <span className="flex min-w-0 items-center gap-2.5">
                        <MonogramTile letter={row.company[0]} />
                        <span className="truncate text-sm font-medium">
                            {row.company}
                        </span>
                    </span>
                    <span className="hidden truncate text-sm text-sub sm:block">
                        {row.role}
                    </span>
                    <span className={`text-sm font-medium ${row.stageClass}`}>
                        {row.stage}
                    </span>
                    <span className="hidden text-sm text-sub tabular-nums sm:block">
                        {row.salary}
                    </span>
                    <span className="hidden text-xs text-muted sm:block">
                        {row.added}
                    </span>
                </div>
            ))}
        </div>

        {emailSyncPromotionEnabled && (
            <div className="flex h-10 items-center border-t border-hairline px-4">
                <span className="lp lp-activity flex items-center gap-2">
                    <span className="icon-[simple-icons--gmail] size-3 text-muted" />
                    <span className="text-xs text-sub">
                        Ramp moved to Interview from your inbox
                    </span>
                </span>
            </div>
        )}
    </div>
);
