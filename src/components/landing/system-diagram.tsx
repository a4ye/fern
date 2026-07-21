import { APP_NAME } from "@/lib/site";

const PanelHeader = ({ label }: { label: string }) => (
    <div className="flex h-8 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-sub">{label}</span>
    </div>
);

const FlowPath = ({ d, delay = 0 }: { d: string; delay?: number }) => (
    <>
        <path
            d={d}
            fill="none"
            stroke="var(--color-tile-border)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
        />
        <path
            d={d}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="5 400"
            vectorEffect="non-scaling-stroke"
            style={{ animationDelay: `${delay}ms` }}
            className="flow-curve"
        />
    </>
);

const FlowCurve = ({ d, delay = 0 }: { d: string; delay?: number }) => (
    <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
    >
        <FlowPath d={d} delay={delay} />
    </svg>
);

const VConn = ({ up = false, delay = 0 }: { up?: boolean; delay?: number }) => (
    <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mx-auto h-8 w-8 overflow-visible"
    >
        <FlowPath d={up ? "M50 100 L50 0" : "M50 0 L50 100"} delay={delay} />
    </svg>
);

const PostingPanel = () => (
    <div className="border border-hairline bg-background">
        <PanelHeader label="The posting" />
        <div className="flex items-center gap-2 border-b border-faint px-3 py-2">
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3 shrink-0 text-muted"
            >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="truncate text-xs text-sub">
                jobs.ashbyhq.com/ramp/frontend-engineer
            </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-muted">Role</span>
            <span className="text-xs text-ink">Frontend Engineer</span>
        </div>
    </div>
);

const InboxPanel = () => (
    <div className="border border-hairline bg-background">
        <PanelHeader label="Your inbox" />
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
                <p className="text-xs font-medium text-ink">Ramp Recruiting</p>
                <p className="mt-0.5 truncate text-xs text-sub">
                    Interview availability
                </p>
            </div>
            <span className="icon-[simple-icons--gmail] mt-0.5 size-3 shrink-0 text-muted" />
        </div>
    </div>
);

const TrackerPanel = () => (
    <div className="border border-hairline bg-background shadow-xl shadow-ink/5">
        <div className="h-0.75 bg-accent" />
        <div className="flex h-9 items-center border-b border-hairline px-4">
            <span className="text-xs font-medium text-ink">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-6 shrink-0 items-center justify-center border border-tile-border bg-background text-xs font-medium text-accent">
                R
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">Ramp</span>
                <span className="block truncate text-xs text-sub">
                    Frontend Engineer
                </span>
            </span>
            <span className="text-sm font-medium text-accent-deep">
                Interview
            </span>
        </div>
        <div className="flex items-center gap-2 border-t border-faint px-4 py-2">
            <span className="text-xs text-sub">
                Salary, dates, and stage kept current
            </span>
        </div>
    </div>
);

export const SystemDiagram = () => (
    <div aria-hidden="true">
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,5fr)_5rem_minmax(0,6fr)]">
            <div className="flex flex-col justify-center gap-12">
                <PostingPanel />
                <InboxPanel />
            </div>
            <div className="grid grid-rows-2">
                <FlowCurve d="M0 50 C 45 50, 55 100, 100 100" />
                <FlowCurve d="M0 50 C 45 50, 55 0, 100 0" delay={1300} />
            </div>
            <div className="self-center">
                <TrackerPanel />
            </div>
        </div>

        <div className="flex flex-col gap-2 lg:hidden">
            <PostingPanel />
            <VConn />
            <TrackerPanel />
            <VConn up delay={1300} />
            <InboxPanel />
        </div>
    </div>
);
