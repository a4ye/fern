import { CARET_PATH } from "@/components/brand/logo";

const QR_SIZE = 17;
const FINDER_CORNERS = [
    [0, 0],
    [QR_SIZE - 7, 0],
    [0, QR_SIZE - 7],
];

const cell = (x: number, y: number) => `M${x} ${y}h1v1h-1z`;

// The three squares a reader finds before it can read anything else, each a
// dark 7x7 ring around a white ring around a dark core. They are drawn one path
// apiece so that the code can be shown finding them in turn.
const FINDER_PATHS = FINDER_CORNERS.map(([left, top]) =>
    Array.from({ length: 7 }, (_, dy) =>
        Array.from({ length: 7 }, (_, dx) =>
            Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) === 2
                ? ""
                : cell(left + dx, top + dy),
        ).join(""),
    ).join(""),
);

const inFinder = (x: number, y: number) =>
    FINDER_CORNERS.some(
        ([left, top]) =>
            x >= left - 1 && x <= left + 7 && y >= top - 1 && y <= top + 7,
    );

// The rest of the square has the texture of a code and none of its meaning: a
// module is dark by its own position, so the pattern is the same on the server
// as in the browser and it points nowhere.
const MODULE_PATH = Array.from({ length: QR_SIZE }, (_, y) =>
    Array.from({ length: QR_SIZE }, (_, x) =>
        !inFinder(x, y) && (x * 5 + y * 11 + ((x * y) % 7)) % 7 < 3
            ? cell(x, y)
            : "",
    ).join(""),
).join("");

const PasteArt = () => (
    <div className="flex h-9 w-full max-w-64 items-center gap-2 border border-hairline bg-background px-2.5">
        <span className="icon-[lucide--link] size-3 shrink-0 text-muted" />
        <span className="truncate text-xs text-sub">
            jobs.ashbyhq.com/ramp/frontend
        </span>
        <span className="lp-caret h-3.5 w-px shrink-0 bg-ink" />
    </div>
);

const ExtensionArt = () => (
    <div className="w-full max-w-64 border border-hairline bg-background">
        <div className="flex h-6 items-end border-b border-hairline bg-surface px-2">
            <span className="h-4 w-20 border-x border-t border-hairline bg-background" />
        </div>
        <div className="flex items-center gap-2 border-b border-faint px-2 py-1.5">
            <span className="icon-[lucide--lock] size-2.5 shrink-0 text-muted" />
            <span className="flex-1 truncate text-xs text-sub">
                careers.acme.com
            </span>
            <svg
                viewBox="8 10 40 30"
                className="h-3 w-auto shrink-0"
                aria-hidden="true"
            >
                <path d={CARET_PATH} className="fill-accent" />
            </svg>
        </div>
        <div className="px-2 py-2.5">
            <span className="block h-1.5 w-2/3 bg-hairline" />
            <span className="mt-1.5 block h-1.5 w-5/6 bg-hairline" />
            <span className="mt-1.5 block h-1.5 w-1/2 bg-hairline" />
        </div>
    </div>
);

const ScanBracket = ({ className }: { className: string }) => (
    <span className={`absolute size-3 border-accent ${className}`} />
);

const QrArt = () => (
    <div className="relative size-28 p-2">
        <svg viewBox="-1 -1 19 19" className="size-full" aria-hidden="true">
            <path
                d={MODULE_PATH}
                className="fill-ink"
                shapeRendering="crispEdges"
            />
            {FINDER_PATHS.map((d, index) => (
                <path
                    key={d}
                    d={d}
                    className="qr-lock fill-ink"
                    shapeRendering="crispEdges"
                    style={{ animationDelay: `${index * 240}ms` }}
                />
            ))}
        </svg>
        <span className="qr-frame absolute inset-0">
            <ScanBracket className="top-0 left-0 border-t border-l" />
            <ScanBracket className="top-0 right-0 border-t border-r" />
            <ScanBracket className="bottom-0 left-0 border-b border-l" />
            <ScanBracket className="right-0 bottom-0 border-r border-b" />
        </span>
    </div>
);

const SOURCES = [
    {
        title: "Paste a link",
        body: "The company, role, pay, and dates are filled in for you.",
        art: <PasteArt />,
    },
    {
        title: "Add the extension",
        body: "For the sites a plain link cannot reach. Chrome and Firefox.",
        art: <ExtensionArt />,
    },
    {
        title: "Scan a QR code",
        body: "For a code on a poster or a screen, with no link to copy first.",
        art: <QrArt />,
    },
];

const ROWS = [
    { letter: "R", company: "Ramp", role: "Frontend Engineer" },
    { letter: "F", company: "Figma", role: "Software Engineer" },
    { letter: "S", company: "Shopify", role: "Backend Developer" },
];

// Each source leaves its column downwards and arrives at the list the same way,
// so the curve between the two is an S with a vertical tangent at both ends.
const BRANCHES = [
    "M16.7 0 C 16.7 60, 50 40, 50 100",
    "M50 0 V100",
    "M83.3 0 C 83.3 60, 50 40, 50 100",
];

export const CapturePanel = () => (
    <div aria-hidden="true" className="border border-hairline bg-background">
        <div className="grid border-b border-hairline sm:grid-cols-3">
            {SOURCES.map((source) => (
                <div
                    key={source.title}
                    className="flex flex-col gap-6 border-b border-hairline px-5 py-7 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
                >
                    <div className="flex h-24 items-center justify-center">
                        {source.art}
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">{source.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-sub">
                            {source.body}
                        </p>
                    </div>
                </div>
            ))}
        </div>

        <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="hidden h-24 w-full sm:block"
        >
            {BRANCHES.map((d, index) => (
                <g key={d}>
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
                        style={{ animationDelay: `${index * 850}ms` }}
                        className="flow-curve"
                    />
                </g>
            ))}
        </svg>

        <div className="flex h-9 items-center gap-2 border-b border-hairline bg-surface px-4 sm:border-t">
            <span className="icon-[lucide--list] size-3 shrink-0 text-muted" />
            <span className="text-xs font-medium text-sub">Summer 2026</span>
        </div>
        {ROWS.map((row) => (
            <div
                key={row.company}
                className="flex items-center gap-3 border-b border-faint px-4 py-3 last:border-b-0"
            >
                <span className="flex size-6 shrink-0 items-center justify-center border border-tile-border bg-background text-xs font-medium text-accent">
                    {row.letter}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                        {row.company}
                    </span>
                    <span className="block truncate text-xs text-sub">
                        {row.role}
                    </span>
                </span>
                <span className="text-sm text-sub">Applied</span>
            </div>
        ))}
    </div>
);
