"use client";

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
    ResponsiveSankey,
    type SankeyCustomLayer,
    type SankeyLinkDatum,
    type SankeyNodeDatum,
} from "@nivo/sankey";
import { useTooltip } from "@nivo/tooltip";
import type { ApplicationStatus, FlowEntry } from "@/components/dashboard/data";

const SAGE = "var(--color-accent)";
const DEEP = "var(--color-accent-deep)";
const GREY = "var(--color-tile-border)";
const GOLD = "var(--color-gold)";
const ROSE = "var(--color-rose)";

// A column is a position in an application's journey, not a status, so the same
// status can appear more than once. Journeys longer than this keep their opening
// moves and their current one, so the chart cannot run off the panel.
const MAX_STEPS = 6;

// Space between a node bar and the label sitting to its right.
const LABEL_GAP = 10;

// Padding between a label's glyphs and the edge of its plate.
const PLATE_X = 6;
const PLATE_Y = 3;

// Stands in for an application that has been applied to and has not moved since.
// Its journey is a single status, and a lone node has nothing to connect to.
const WAITING = "waiting";

type Step = ApplicationStatus | typeof WAITING;

const FILL: Record<Step, string> = {
    not_applied: GREY,
    applied: SAGE,
    waiting: GREY,
    online_assessment: DEEP,
    takehome: DEEP,
    interviewing: SAGE,
    onsite: DEEP,
    offer_in_progress: GOLD,
    offer_accepted: DEEP,
    offer_declined: GREY,
    offer_rescinded: ROSE,
    rejected: ROSE,
    ghosted: GREY,
    other: GREY,
};

// Shorter than the status labels used elsewhere, because a journey puts several
// of these in a column and the full names collide.
const LABEL: Record<Step, string> = {
    not_applied: "Not applied",
    applied: "Applied",
    waiting: "Awaiting reply",
    online_assessment: "OA",
    takehome: "Take-home",
    interviewing: "Interview",
    onsite: "Onsite",
    offer_in_progress: "Offer",
    offer_accepted: "Accepted",
    offer_declined: "Declined",
    offer_rescinded: "Rescinded",
    rejected: "Rejected",
    ghosted: "No reply",
    other: "Other",
};

// The statuses an application has held, in order, collapsed so that a status
// held twice in a row counts once. Columns come from position rather than
// status, so a status revisited later in the journey is a separate node and a
// loop back to an earlier stage needs no flattening.
const journeyOf = (entry: FlowEntry): Step[] => {
    const steps: Step[] = [];
    for (const status of entry.history) {
        if (steps[steps.length - 1] !== status) steps.push(status);
    }

    // Everything starts out not applied, so that status only says something
    // about an application that never left it.
    if (steps.length > 1 && steps[0] === "not_applied") steps.shift();
    if (steps.length === 0) return steps;

    // An application that is interviewing was applied to, even when no one ever
    // recorded it passing through.
    const first = steps[0];
    if (first !== "applied" && first !== "not_applied")
        steps.unshift("applied");
    if (steps.length === 1 && steps[0] === "applied") steps.push(WAITING);

    // A journey too long to draw keeps where it started and its most recent
    // moves, since those are the ones still in play. The first ribbon then
    // stands in for whatever was skipped between them.
    return steps.length > MAX_STEPS
        ? [steps[0], ...steps.slice(steps.length - MAX_STEPS + 1)]
        : steps;
};

type FlowNode = { id: string; name: string; fill: string };
type FlowLink = { source: string; target: string; value: number };

// Node ids end up in the gradient ids the exported SVG references, and a colon
// there is a namespace separator to anything reading the file as XML.
const nodeId = (position: number, step: Step) => `${position}-${step}`;

// Indexed by how many times an application has held the status, so the first
// one is unnumbered.
const ORDINAL = ["", "", "2nd ", "3rd ", "4th ", "5th ", "6th "];

type Placed = { position: number; step: Step; visits: Set<number> };

const graphFrom = (flow: FlowEntry[]) => {
    const moves = new Map<string, number>();
    const placed = new Map<string, Placed>();

    for (const entry of flow) {
        const journey = journeyOf(entry);
        if (journey.length < 2) continue;

        // Count each status as the application reaches it, so a node can call
        // itself the second interview only when it is the second one for every
        // application passing through it.
        const held = new Map<Step, number>();
        const ids = journey.map((step, at) => {
            const visit = (held.get(step) ?? 0) + 1;
            held.set(step, visit);
            const id = nodeId(at, step);
            const node = placed.get(id) ?? {
                position: at,
                step,
                visits: new Set<number>(),
            };
            node.visits.add(visit);
            placed.set(id, node);
            return id;
        });

        for (let at = 1; at < ids.length; at += 1) {
            const move = `${ids[at - 1]} ${ids[at]}`;
            moves.set(move, (moves.get(move) ?? 0) + 1);
        }
    }

    const links: FlowLink[] = [...moves].map(([move, value]) => {
        const [source, target] = move.split(" ");
        return { source, target, value };
    });

    // Applications can arrive at the same point having done a different number
    // of rounds, and then there is no round number the node can honestly claim.
    const nodes: FlowNode[] = [...placed.entries()]
        .sort(([, a], [, b]) => a.position - b.position)
        .map(([id, { step, visits }]) => {
            const [visit] = visits;
            const round = visits.size === 1 ? visit : 1;
            return {
                id,
                name: `${ORDINAL[round] ?? ""}${LABEL[step]}`,
                fill: FILL[step],
            };
        });

    return { nodes, links };
};

// A ribbon ends exactly where its node begins, and Firefox antialiases both
// sides of that shared edge, so the background shows through as a hairline.
// Ribbons run a little way under the nodes instead, which are opaque and drawn
// after, and are thick enough to hide the overlap.
const BLEED = 1;

// Nivo's own ribbons bend within a tenth of the gap between columns, which reads
// as a rectangle with rounded corners. Anchoring both control points at the
// midpoint gives the long S-curve a Sankey is recognised by.
const ribbonPath = (link: SankeyLinkDatum<FlowNode, FlowLink>) => {
    const mid = (link.source.x1 + link.target.x0) / 2;
    const x0 = link.source.x1 - BLEED;
    const x1 = link.target.x0 + BLEED;
    const half = Math.max(1, link.thickness) / 2;
    const top0 = link.pos0 - half;
    const top1 = link.pos1 - half;
    const base0 = link.pos0 + half;
    const base1 = link.pos1 + half;
    return [
        `M${x0},${top0}`,
        `C${mid},${top0} ${mid},${top1} ${x1},${top1}`,
        `L${x1},${base1}`,
        `C${mid},${base1} ${mid},${base0} ${x0},${base0}`,
        "Z",
    ].join(" ");
};

const gradientId = (link: SankeyLinkDatum<FlowNode, FlowLink>) =>
    `flow-${link.source.id}-${link.target.id}`;

const Tip = ({ children }: { children: ReactNode }) => (
    <div className="border border-hairline bg-background px-2 py-1 text-xs whitespace-nowrap text-ink">
        {children}
    </div>
);

const NodeTip = ({ node }: { node: SankeyNodeDatum<FlowNode, FlowLink> }) => (
    <Tip>
        <span className="font-medium">{node.name}</span>
        <span className="text-sub"> · {node.value}</span>
    </Tip>
);

const LinkTip = ({ link }: { link: SankeyLinkDatum<FlowNode, FlowLink> }) => (
    <Tip>
        <span className="font-medium">{link.source.name}</span>
        <span className="text-sub"> to </span>
        <span className="font-medium">{link.target.name}</span>
        <span className="text-sub"> · {link.value}</span>
    </Tip>
);

const DIMMED = 0.3;

type FlowNodeDatum = SankeyNodeDatum<FlowNode, FlowLink>;
type SelectNode = (node: FlowNodeDatum | null) => void;

// A bar and its label are one target, so both raise the same tooltip and light
// the same node.
const useNodeHover = (node: FlowNodeDatum, select: SelectNode) => {
    const { showTooltipFromEvent, hideTooltip } = useTooltip();
    const show = (event: MouseEvent<SVGElement>) =>
        showTooltipFromEvent(<NodeTip node={node} />, event);

    return {
        onMouseEnter: (event: MouseEvent<SVGElement>) => {
            select(node);
            show(event);
        },
        onMouseMove: show,
        onMouseLeave: () => {
            select(null);
            hideTooltip();
        },
    };
};

const NodeBar = ({
    node,
    dimmed,
    select,
}: {
    node: FlowNodeDatum;
    dimmed: boolean;
    select: SelectNode;
}) => {
    const hover = useNodeHover(node, select);
    return (
        <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={node.color}
            fillOpacity={dimmed ? DIMMED : 1}
            {...hover}
        />
    );
};

// Nivo counts a hovered node's neighbours as current too, so hovering leaves
// three columns lit. Only the hovered bar should stay.
const Nodes: SankeyCustomLayer<FlowNode, FlowLink> = ({
    nodes,
    currentNode,
    setCurrentNode,
}) => (
    <g>
        {nodes.map((node) => (
            <NodeBar
                key={node.id}
                node={node}
                dimmed={!!currentNode && currentNode.id !== node.id}
                select={setCurrentNode}
            />
        ))}
    </g>
);

// Nivo puts a label on whichever side of its node faces the nearer edge of the
// chart, flipping at the halfway mark. That doubles labels up in the outer gaps
// and leaves the middle gap, where the flip happens, with none at all. Instead
// the opening column reads outwards to the left and every other column reads
// rightwards, so each gap carries exactly one column's labels.
//
// Labels land on top of ribbons, so each sits on a plate of the background
// colour, matching the landing page's chart. SVG has no box around text, so the
// plate is drawn from the rendered glyphs' own measurements.
const FlowLabel = ({
    node,
    select,
}: {
    node: FlowNodeDatum;
    select: SelectNode;
}) => {
    const text = useRef<SVGTextElement>(null);
    const [plate, setPlate] = useState<DOMRect | null>(null);
    const hover = useNodeHover(node, select);
    const opening = node.depth === 0;
    const x = opening ? node.x0 - LABEL_GAP : node.x1 + LABEL_GAP;
    const y = (node.y0 + node.y1) / 2;

    useLayoutEffect(() => {
        setPlate(text.current?.getBBox() ?? null);
    }, [node.name, node.value, x, y]);

    return (
        <g {...hover}>
            {plate && (
                <rect
                    x={plate.x - PLATE_X}
                    y={plate.y - PLATE_Y}
                    width={plate.width + PLATE_X * 2}
                    height={plate.height + PLATE_Y * 2}
                    fill="var(--color-background)"
                    fillOpacity={0.85}
                />
            )}
            <text
                ref={text}
                x={x}
                y={y}
                textAnchor={opening ? "end" : "start"}
                dominantBaseline="central"
                fontSize={12}
            >
                <tspan fill="var(--color-ink)" fontWeight={500}>
                    {node.name}
                </tspan>
                <tspan dx={4} fill="var(--color-sub)">
                    · {node.value}
                </tspan>
            </text>
        </g>
    );
};

const Labels: SankeyCustomLayer<FlowNode, FlowLink> = ({
    nodes,
    setCurrentNode,
}) => (
    <g>
        {nodes.map((node) => (
            <FlowLabel key={node.id} node={node} select={setCurrentNode} />
        ))}
    </g>
);

// Replacing the built-in link layer means its hover handling goes with it, so
// the ribbons wire up their own; without this only nodes would have a tooltip.
const Ribbons: SankeyCustomLayer<FlowNode, FlowLink> = ({ links }) => {
    const { showTooltipFromEvent, hideTooltip } = useTooltip();

    return (
        <g>
            <defs>
                {links.map((link) => (
                    <linearGradient
                        key={gradientId(link)}
                        id={gradientId(link)}
                        x1="0%"
                        x2="100%"
                        y1="0%"
                        y2="0%"
                    >
                        <stop offset="0%" stopColor={link.source.color} />
                        <stop offset="100%" stopColor={link.target.color} />
                    </linearGradient>
                ))}
            </defs>
            {links.map((link) => (
                <path
                    key={gradientId(link)}
                    d={ribbonPath(link)}
                    fill={`url(#${gradientId(link)})`}
                    fillOpacity={0.55}
                    onMouseEnter={(event) =>
                        showTooltipFromEvent(<LinkTip link={link} />, event)
                    }
                    onMouseMove={(event) =>
                        showTooltipFromEvent(<LinkTip link={link} />, event)
                    }
                    onMouseLeave={hideTooltip}
                />
            ))}
        </g>
    );
};

const fileSlug = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "chart";

// The chart paints itself with design tokens that only exist on the page, so a
// standalone file has to carry their resolved values.
const EXPORT_TOKENS = [
    "--color-background",
    "--color-ink",
    "--color-sub",
    "--color-accent",
    "--color-accent-deep",
    "--color-tile-border",
    "--color-gold",
    "--color-rose",
];

const svgMarkup = (chart: HTMLDivElement) => {
    const source = chart.querySelector("svg");
    if (!source) return null;

    const clone = source.cloneNode(true) as SVGSVGElement;
    const page = getComputedStyle(document.documentElement);
    for (const token of EXPORT_TOKENS)
        clone.style.setProperty(token, page.getPropertyValue(token).trim());
    // Labels inherit the page's font, which nothing outside the page will.
    clone.style.fontFamily = getComputedStyle(chart).fontFamily;

    return new XMLSerializer().serializeToString(clone);
};

const ExportOption = ({
    format,
    icon,
    note,
    onSelect,
}: {
    format: string;
    icon: string;
    note: string;
    onSelect: () => void;
}) => (
    <button
        type="button"
        role="menuitem"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-center gap-2.5 border-b border-faint px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface"
    >
        <span
            aria-hidden="true"
            className={`${icon} size-4 shrink-0 text-muted`}
        />
        <span className="min-w-0">
            <span className="block text-xs font-medium text-ink">{format}</span>
            <span className="block text-xs text-sub">{note}</span>
        </span>
    </button>
);

export const PipelineFlow = ({
    flow,
    name,
}: {
    flow: FlowEntry[];
    name: string;
}) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const graph = graphFrom(flow);
    const chartable = graph.links.length > 0;

    useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node))
                setMenuOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [menuOpen]);

    const download = (href: string, extension: string) => {
        const link = document.createElement("a");
        link.download = `${fileSlug(name)}-sankey.${extension}`;
        link.href = href;
        link.click();
    };

    const exportPng = async () => {
        const node = chartRef.current;
        if (!node || exporting) return;
        setExporting(true);
        try {
            const background =
                getComputedStyle(document.documentElement)
                    .getPropertyValue("--color-background")
                    .trim() || "#ffffff";
            download(
                await toPng(node, {
                    pixelRatio: 2,
                    backgroundColor: background,
                }),
                "png",
            );
        } catch {
            toast.error("Could not export the chart.");
        } finally {
            setExporting(false);
        }
    };

    const exportSvg = () => {
        const markup = chartRef.current && svgMarkup(chartRef.current);
        if (!markup) {
            toast.error("Could not export the chart.");
            return;
        }
        download(
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`,
            "svg",
        );
    };

    return (
        <section className="border border-hairline bg-background">
            <div className="flex h-10 items-center justify-between border-b border-hairline px-4">
                <h2 className="text-xs font-medium text-muted">Sankey</h2>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-sub tabular-nums">
                        {flow.length} total
                    </span>
                    {chartable && (
                        <div
                            ref={menuRef}
                            onKeyDown={(event) =>
                                event.key === "Escape" && setMenuOpen(false)
                            }
                            className="relative"
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    setMenuOpen((previous) => !previous)
                                }
                                disabled={exporting}
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                aria-label="Download this chart"
                                title="Download"
                                className="cursor-pointer p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--download] block size-4"
                                />
                            </button>
                            {menuOpen && (
                                <div
                                    role="menu"
                                    aria-label="Download this chart"
                                    className="absolute top-full right-0 z-20 mt-1 w-40 border border-hairline bg-background shadow-sm"
                                >
                                    <p className="border-b border-hairline px-3 py-1.5 text-xs font-medium text-muted">
                                        Download
                                    </p>
                                    <ExportOption
                                        format="PNG"
                                        icon="icon-[lucide--image]"
                                        note="Bitmap image"
                                        onSelect={() => {
                                            setMenuOpen(false);
                                            exportPng();
                                        }}
                                    />
                                    <ExportOption
                                        format="SVG"
                                        icon="icon-[lucide--vector-square]"
                                        note="Vector image"
                                        onSelect={() => {
                                            setMenuOpen(false);
                                            exportSvg();
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {!chartable ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    Not enough activity to chart yet.
                </p>
            ) : (
                <div ref={chartRef} className="h-112 px-4 py-4">
                    <ResponsiveSankey
                        data={graph}
                        // Each node belongs to a fixed position in the journey,
                        // so depth is counted from the left rather than pushing
                        // whatever stops early over to the right edge.
                        align="start"
                        // Room for the opening label on the left and the closing
                        // column's on the right, plates included.
                        margin={{ top: 16, right: 152, bottom: 16, left: 98 }}
                        colors={(node) => node.fill}
                        layers={[Ribbons, Nodes, Labels]}
                        nodeThickness={8}
                        nodeSpacing={20}
                        animate={false}
                        theme={{
                            // Nivo paints this behind the chart, which is what
                            // gives an exported SVG its background.
                            background: "var(--color-background)",
                            text: { fontFamily: "inherit", fontSize: 12 },
                        }}
                    />
                </div>
            )}
        </section>
    );
};
