type Entry = {
    text: string;
    value?: string;
    stage?: boolean;
    when: string;
    undo?: boolean;
};

const BEFORE: Entry[] = [
    {
        text: "Ramp moved to",
        value: "Interview",
        stage: true,
        when: "2:14 pm",
        undo: true,
    },
    { text: "Figma pay set to", value: "$62 per hour", when: "11:02 am" },
    { text: "3 applications deleted", when: "Yesterday", undo: true },
];

const AFTER: Entry[] = [
    { text: "24 applications added", when: "Monday" },
    { text: "Stripe moved to", value: "Applied", stage: true, when: "Monday" },
];

const Row = ({ entry }: { entry: Entry }) => (
    <div className="flex items-center gap-3 border-b border-faint px-4 py-3 last:border-b-0 sm:gap-4">
        <span className="min-w-0 flex-1 truncate text-sm">
            {entry.text}
            {entry.value && (
                <span
                    className={`font-medium ${entry.stage ? "text-accent-deep" : ""}`}
                >
                    {" "}
                    {entry.value}
                </span>
            )}
        </span>
        <span className="hidden w-20 shrink-0 text-right text-xs text-muted sm:block">
            {entry.when}
        </span>
        <span className="flex w-16 shrink-0 justify-end sm:w-20">
            {entry.undo && (
                <span className="flex h-6 items-center gap-1.5 border border-hairline px-2 text-xs font-medium text-sub">
                    <span className="icon-[lucide--rotate-ccw] size-3" />
                    Undo
                </span>
            )}
        </span>
    </div>
);

export const ChangeLog = () => (
    <div aria-hidden="true" className="border border-hairline bg-background">
        <div className="flex h-10 items-center justify-between border-b border-hairline bg-surface px-4">
            <span className="flex items-center gap-2 text-xs font-medium text-sub">
                <span className="icon-[lucide--history] size-3 text-muted" />
                History
            </span>
            <span className="text-xs text-muted">Summer 2026</span>
        </div>

        {BEFORE.map((entry) => (
            <Row key={entry.text} entry={entry} />
        ))}

        <div className="flex items-center gap-3 border-b border-faint px-4 py-2.5">
            <span className="flex h-6 shrink-0 items-center gap-1.5 border border-tile-border bg-background px-2 text-xs font-medium text-accent-deep">
                <span className="icon-[lucide--corner-up-left] size-3 text-accent" />
                Restore to this point
            </span>
            <span className="h-px flex-1 bg-accent-tint" />
        </div>

        {AFTER.map((entry) => (
            <Row key={entry.text} entry={entry} />
        ))}
    </div>
);
