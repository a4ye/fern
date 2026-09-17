const ROWS = [
    { company: "Ramp", role: "Frontend Engineer", stage: "Interview" },
    { company: "Figma", role: "Software Engineer", stage: "Applied" },
    { company: "Stripe", role: "Backend Engineer", stage: "Applied" },
    { company: "Shopify", role: "Backend Developer", stage: "Rejected" },
    { company: "Vercel", role: "Frontend Engineer", stage: "Applied" },
    { company: "Notion", role: "Product Engineer", stage: "Saved" },
];

// The list at the back is the thing being shared, quiet and unfilled so that it
// sits behind. The card in front is the entry it becomes in the other account.
export const SharePanel = () => (
    <div aria-hidden="true" className="relative lg:pb-6">
        <div className="border border-hairline">
            <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3">
                <span className="text-sm font-medium text-sub">
                    Summer 2026
                </span>
                <span className="text-xs text-muted">40 applications</span>
            </div>
            {ROWS.map((row) => (
                <div
                    key={row.company}
                    className="flex items-center gap-4 border-b border-faint px-4 py-3 last:border-b-0"
                >
                    <span className="w-24 shrink-0 truncate text-sm text-sub">
                        {row.company}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                        {row.role}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                        {row.stage}
                    </span>
                </div>
            ))}
        </div>

        <div className="mt-6 border border-hairline bg-background shadow-2xl shadow-ink/15 lg:absolute lg:right-8 lg:-bottom-4 lg:mt-0 lg:w-88">
            <div className="h-0.75 bg-accent" />
            <div className="px-4 py-3.5">
                <p className="text-xs font-medium text-muted">
                    Shared with you
                </p>
                <div className="mt-2.5 flex items-center gap-3">
                    <span className="truncate text-base font-medium">
                        Summer 2026
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 bg-hairline px-2 py-0.5 text-xs font-medium text-sub">
                        <span className="icon-[lucide--eye] size-3" />
                        Read only
                    </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2 text-sm text-sub">
                        <span className="flex size-5 shrink-0 items-center justify-center border border-tile-border bg-background text-xs font-medium text-accent">
                            A
                        </span>
                        Aaron
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                        Edited Jun 12
                    </span>
                </div>
            </div>
        </div>
    </div>
);
