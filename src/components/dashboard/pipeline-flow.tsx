"use client";

import {
    useEffect,
    useRef,
    useState,
    type MouseEvent,
    type ReactNode,
    type Ref,
} from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
    ResponsiveSankey,
    Sankey,
    type SankeyCustomLayer,
    type SankeyLinkDatum,
    type SankeyNodeDatum,
    type SankeySvgProps,
} from "@nivo/sankey";
import { useTooltip } from "@nivo/tooltip";
import {
    APPLICATION_STATUSES,
    STATUS_META,
    type ApplicationStatus,
    type FlowEntry,
} from "@/components/dashboard/data";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";

const SAGE = "var(--color-accent)";
const DEEP = "var(--color-accent-deep)";
const GREY = "var(--color-tile-border)";
const GOLD = "var(--color-gold)";
const ROSE = "var(--color-rose)";

// Space between a node bar and the label sitting to its right.
const LABEL_GAP = 6;

// Padding between a label's glyphs and the edge of its plate.
const PLATE_X = 4;
const PLATE_Y = 2;

const LABEL_SIZE = 10;

// Left and right leave room for the opening and closing columns' labels, plates
// included, since those read outwards past the ends of the chart.
const MARGIN = { top: 16, right: 112, bottom: 16, left: 80 };
const NODE_THICKNESS = 8;

// Nivo spreads the columns over whatever width it is handed, so a long journey
// squeezes label plates into each other. Narrower than this and the panel
// scrolls rather than overlapping them.
const COLUMN_GAP = 96;

// Horizontal padding inside the chart box, which min-width has to carry too.
const CHART_PAD = 32;

const chartWidth = (columns: number) =>
    CHART_PAD +
    MARGIN.left +
    MARGIN.right +
    NODE_THICKNESS +
    COLUMN_GAP * (columns - 1);

// The panel gives the chart whatever room is left over beside the rest of the
// dashboard. The popup and every download use this roomier geometry instead, so
// a saved file never inherits the panel's crowding.
const EXPANDED_COLUMN_GAP = 176;
const EXPANDED_HEIGHT = 780;
const EXPANDED_MIN_WIDTH = 880;

const expandedWidth = (columns: number) =>
    Math.max(
        EXPANDED_MIN_WIDTH,
        MARGIN.left +
            MARGIN.right +
            NODE_THICKNESS +
            EXPANDED_COLUMN_GAP * (columns - 1),
    );

const FILL: Record<ApplicationStatus, string> = {
    not_applied: GREY,
    applied: SAGE,
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

// Names the round an application went through, so it is shorter than the status
// label used elsewhere and reads as an event rather than a state. A journey puts
// several of these in a column, where the full names would collide. Where a
// journey stopped, STATUS_META's label is used instead, so "Interview" is one an
// application sat through and "Interviewing" is where it is now.
const LABEL: Record<ApplicationStatus, string> = {
    not_applied: "Not applied",
    applied: "Applied",
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

// What a journey that stopped is called. Mostly the status label used elsewhere,
// which reads as a state next to the shorter round names above. Sitting at
// "applied" is really waiting to hear back, so it says so.
const restingLabel = (step: ApplicationStatus) =>
    step === "applied" ? "Awaiting reply" : STATUS_META[step].label;

// The statuses an application has held, in order. A status held twice in a row
// is a round of it logged again, so it keeps both steps and reads as a second
// interview rather than one long one. Reaching a status again later works the
// same way, so a loop back to an earlier stage needs no flattening either.
const journeyOf = (entry: FlowEntry): ApplicationStatus[] => {
    const steps = [...entry.history];

    // Everything starts out not applied, so that status only says something
    // about an application that never left it.
    if (steps.length > 1 && steps[0] === "not_applied") steps.shift();
    if (steps.length === 0) return steps;

    // An application that is interviewing was applied to, even when no one ever
    // recorded it passing through.
    const first = steps[0];
    if (first !== "applied" && first !== "not_applied")
        steps.unshift("applied");

    return steps;
};

// `via` nodes are the invisible ones a long ribbon is threaded through, and
// carry no bar or label of their own. A link records the ends it really joins
// so a threaded ribbon still names them when hovered.
type FlowNode = { id: string; name: string; fill: string; via: boolean };
type FlowLink = {
    source: string;
    target: string;
    value: number;
    from: string;
    to: string;
};

// One point in one application's journey.
type Visit = { step: ApplicationStatus; round: number; at: number };

// What makes two points in different journeys the same place: the status, and
// which time round it is. Node ids end up in the gradient ids the exported SVG
// references, and a colon there is a namespace separator to anything reading
// the file as XML.
const roundId = (visit: Visit) => `${visit.step}-${visit.round}`;

// The same place, but pinned to where it falls in the journey. Statuses that
// loop have to fall back to this, since merging them leaves the flow with no
// column order that works.
const pinnedId = (visit: Visit) => `${visit.at}-${roundId(visit)}`;

// Where journeys come to rest. Transit nodes belong to a position, but there is
// one resting node per status for the whole chart, so everything still sitting
// at the same place lands together in the closing column however far along it
// got. Applications passing through a status keep their shared node and the
// ones that stayed branch off it, so nobody's share is drawn inside a bar it
// never leaves.
const restId = (step: ApplicationStatus) => `rest-${step}`;

// Prefixes a label with how many times the application has held that status, so
// the first one is unnumbered and the rest read "2nd Interview", "3rd Interview".
const ordinal = (visit: number) => {
    if (visit < 2) return "";
    const teen = visit % 100 >= 11 && visit % 100 <= 13;
    const suffix = teen
        ? "th"
        : ({ 1: "st", 2: "nd", 3: "rd" }[visit % 10] ?? "th");
    return `${visit}${suffix} `;
};

type Placed = {
    step: ApplicationStatus;
    round: number;
    resting: boolean;
    via?: boolean;
};

// Every application's journey, each status tagged with which time round it is.
const visitsOf = (flow: FlowEntry[]): Visit[][] =>
    flow
        .map((entry) => {
            const journey = journeyOf(entry);
            const held = new Map<ApplicationStatus, number>();
            return journey.map((step, at) => {
                const round = (held.get(step) ?? 0) + 1;
                held.set(step, round);
                return { step, round, at };
            });
        })
        // An application that never left "not applied" has no journey to draw.
        .filter(
            (journey) =>
                journey.length > 0 && journey[0].step !== "not_applied",
        );

// The nodes that can reach themselves, which is what stops a Sankey from having
// a column order at all.
const loopingIn = (edges: Map<string, Set<string>>) => {
    const looping = new Set<string>();
    for (const start of edges.keys()) {
        const seen = new Set<string>();
        const stack = [...(edges.get(start) ?? [])];
        while (stack.length > 0) {
            const id = stack.pop() as string;
            if (id === start) {
                looping.add(start);
                break;
            }
            if (seen.has(id)) continue;
            seen.add(id);
            stack.push(...(edges.get(id) ?? []));
        }
    }
    return looping;
};

// Passes of the ordering sweep below. It settles well before this, and the
// graph is small enough that the extra passes cost nothing.
const SWEEPS = 8;

// Which way round the statuses read down a column before any sweeping, so the
// starting order is the pipeline's own rather than whatever order the
// applications happened to arrive in.
const STAGE = new Map(
    APPLICATION_STATUSES.map((status, index) => [status, index]),
);

// Order the nodes in each column so that ribbons run as flat as they can.
// Repeatedly moving every node to the average height of whatever it connects
// to, forwards then backwards, is the usual way to pull crossings out of a
// layered graph. The chart relaxes the exact heights afterwards, but it starts
// from the order given here, so a tidy order in means a tidy drawing out.
const sweptOrder = (
    placed: Map<string, Placed>,
    depth: Map<string, number>,
    links: FlowLink[],
) => {
    const columns = new Map<number, string[]>();
    const seeded = [...placed.entries()].sort(
        ([a, one], [b, two]) =>
            (STAGE.get(one.step) ?? 0) - (STAGE.get(two.step) ?? 0) ||
            one.round - two.round ||
            a.localeCompare(b),
    );
    for (const [id] of seeded) {
        const at = depth.get(id) ?? 0;
        columns.set(at, [...(columns.get(at) ?? []), id]);
    }

    const before = new Map<string, [string, number][]>();
    const after = new Map<string, [string, number][]>();
    for (const link of links) {
        before.set(link.target, [
            ...(before.get(link.target) ?? []),
            [link.source, link.value],
        ]);
        after.set(link.source, [
            ...(after.get(link.source) ?? []),
            [link.target, link.value],
        ]);
    }

    const at = new Map<string, number>();
    const reindex = (column: string[]) =>
        column.forEach((id, index) => at.set(id, index));
    for (const column of columns.values()) reindex(column);

    const depths = [...columns.keys()].sort((a, b) => a - b);
    const sweep = (order: number[], neighbours: typeof before) => {
        for (const level of order) {
            const column = columns.get(level) as string[];
            const pull = new Map(
                column.map((id) => {
                    const near = neighbours.get(id) ?? [];
                    const weight = near.reduce((sum, [, on]) => sum + on, 0);
                    if (weight === 0) return [id, at.get(id) ?? 0];
                    const total = near.reduce(
                        (sum, [other, on]) => sum + (at.get(other) ?? 0) * on,
                        0,
                    );
                    return [id, total / weight];
                }),
            );
            column.sort(
                (a, b) =>
                    (pull.get(a) as number) - (pull.get(b) as number) ||
                    a.localeCompare(b),
            );
            reindex(column);
        }
    };

    for (let pass = 0; pass < SWEEPS; pass += 1) {
        sweep(depths.slice(1), before);
        sweep([...depths].reverse().slice(1), after);
    }
    return depths.flatMap((level) => columns.get(level) as string[]);
};

// How far from the opening column each node sits, counted along the longest
// route to it, which is how the chart itself lays them out.
const depthsOf = (ids: string[], links: FlowLink[]) => {
    const depth = new Map(ids.map((id) => [id, 0]));
    const waiting = new Map(ids.map((id) => [id, 0]));
    const after = new Map<string, string[]>();
    for (const link of links) {
        after.set(link.source, [
            ...(after.get(link.source) ?? []),
            link.target,
        ]);
        waiting.set(link.target, (waiting.get(link.target) ?? 0) + 1);
    }

    const ready = ids.filter((id) => waiting.get(id) === 0);
    while (ready.length > 0) {
        const id = ready.shift() as string;
        for (const next of after.get(id) ?? []) {
            depth.set(
                next,
                Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1),
            );
            waiting.set(next, (waiting.get(next) ?? 0) - 1);
            if (waiting.get(next) === 0) ready.push(next);
        }
    }
    return depth;
};

export const graphFrom = (flow: FlowEntry[]) => {
    const journeys = visitsOf(flow);

    // How many points in a journey a status and round turns up at, which is how
    // many nodes pinning it would cost. Pinning one that only ever turns up at
    // a single point costs nothing at all.
    const spread = new Map<string, Set<number>>();
    for (const journey of journeys) {
        for (const visit of journey) {
            const at = spread.get(roundId(visit)) ?? new Set<number>();
            spread.set(roundId(visit), at.add(visit.at));
        }
    }

    // Merge every journey onto shared nodes, then pin apart just enough of them
    // to undo any loop that leaves behind. Breaking a loop only takes one of
    // its statuses, so the rest stay merged. Pinning every status would always
    // be acyclic, since those edges only run one column forwards, so this
    // settles. Which status goes is decided by the whole graph rather than by
    // the order the applications arrive in, so the drawing is stable.
    const pinned = new Set<string>();
    const idOf = (visit: Visit) =>
        pinned.has(roundId(visit)) ? pinnedId(visit) : roundId(visit);

    const build = () => {
        const moves = new Map<string, number>();
        const placed = new Map<string, Placed>();
        const rounds = new Map<string, string>();
        const edges = new Map<string, Set<string>>();

        for (const journey of journeys) {
            const ids = journey.map((visit) => {
                const id = idOf(visit);
                placed.set(id, { ...visit, resting: false });
                rounds.set(id, roundId(visit));
                return id;
            });

            const ending = journey[journey.length - 1].step;
            const rest = restId(ending);
            placed.set(rest, { step: ending, round: 1, resting: true });
            ids.push(rest);

            for (let at = 1; at < ids.length; at += 1) {
                const [from, to] = [ids[at - 1], ids[at]];
                moves.set(
                    `${from} ${to}`,
                    (moves.get(`${from} ${to}`) ?? 0) + 1,
                );
                edges.set(from, (edges.get(from) ?? new Set()).add(to));
            }
        }
        return { moves, placed, rounds, edges };
    };

    let graph = build();
    for (;;) {
        const looping = loopingIn(graph.edges);
        if (looping.size === 0) break;
        // Pinning only tells nodes apart when the status turns up at more than
        // one point, and a loop always contains one of those: edges only ever
        // run from a point to the next, so statuses fixed to a single point
        // cannot lead back round. Give up the cheapest of them.
        const [cheapest] = [...looping]
            .map((id) => graph.rounds.get(id) as string)
            .filter(
                (round) =>
                    !pinned.has(round) && (spread.get(round)?.size ?? 0) > 1,
            )
            .sort(
                (a, b) =>
                    (spread.get(a)?.size ?? 0) - (spread.get(b)?.size ?? 0) ||
                    a.localeCompare(b),
            );
        pinned.add(cheapest);
        graph = build();
    }

    const moved: FlowLink[] = [...graph.moves].map(([move, value]) => {
        const [source, target] = move.split(" ");
        return { source, target, value, from: source, to: target };
    });

    // Where every journey through a status stopped there, the status and the
    // state applications are left in are the same place, and drawing both puts
    // the same thing on the chart twice joined by a move nobody made. Fold the
    // resting node back into the status, which then reads as the ending it is.
    // Only when the pair is one to one: a status others carried on from still
    // needs somewhere for the ones that stayed to land, and the opening column
    // has no ribbon to spare.
    const arriving = new Map<string, number>();
    const leaving = new Map<string, number>();
    for (const link of moved) {
        leaving.set(link.source, (leaving.get(link.source) ?? 0) + 1);
        arriving.set(link.target, (arriving.get(link.target) ?? 0) + 1);
    }

    const folded = new Set<string>();
    for (const link of moved) {
        const rest = graph.placed.get(link.target) as Placed;
        if (!rest.resting) continue;
        if (arriving.get(link.target) !== 1) continue;
        if (leaving.get(link.source) !== 1) continue;
        if ((arriving.get(link.source) ?? 0) === 0) continue;
        folded.add(link.target);
        (graph.placed.get(link.source) as Placed).resting = true;
    }
    for (const id of folded) graph.placed.delete(id);

    const direct = moved.filter((link) => !folded.has(link.target));
    const depth = depthsOf([...graph.placed.keys()], direct);

    // A ribbon that skips over a column has nothing holding it out of the way,
    // so the chart is free to lay it straight across whatever nodes sit under
    // it. Thread it through an invisible node in each column it crosses and
    // those columns keep room for it instead, which is what stops ribbons and
    // bars from landing on top of each other.
    const links: FlowLink[] = [];
    for (const link of direct) {
        const from = depth.get(link.source) ?? 0;
        const to = depth.get(link.target) ?? 0;
        let last = link.source;
        for (let level = from + 1; level < to; level += 1) {
            const id = `via-${link.source}-${link.target}-${level}`;
            const { step, round } = graph.placed.get(link.source) as Placed;
            graph.placed.set(id, { step, round, resting: false, via: true });
            depth.set(id, level);
            links.push({ ...link, source: last, target: id });
            last = id;
        }
        links.push({ ...link, source: last });
    }

    const nodes: FlowNode[] = sweptOrder(graph.placed, depth, links).map(
        (id) => {
            const { step, round, resting, via } = graph.placed.get(
                id,
            ) as Placed;
            // Shared resting nodes are always a first round, so the ordinal
            // only shows on a status node that turned out to be an ending.
            const name = `${ordinal(round)}${
                resting ? restingLabel(step) : LABEL[step]
            }`;
            // Nothing is drawn for a node a ribbon only passes through, so it
            // carries no name to be mistaken for a stage of its own.
            return { id, name: via ? "" : name, fill: FILL[step], via: !!via };
        },
    );

    const columns = Math.max(0, ...depth.values()) + 1;

    return { nodes, links, columns };
};

// A ribbon ends exactly where its node begins, and Firefox antialiases both
// sides of that shared edge, so the background shows through as a hairline.
// Ribbons run a little way under the nodes instead, which are opaque and drawn
// after, and are thick enough to hide the overlap.
const BLEED = 1;

type Waypoint = { x: number; y: number };

// One edge of a ribbon, as a curve through every column it passes. The slope at
// each point in the middle follows the run of the points either side, so the
// ribbon leans into its turns instead of levelling off at every one, which is
// what made a threaded ribbon look like a row of S-bends. Where two points sit
// either side of a peak the slope is flattened, so the curve cannot bulge past
// a point it is meant to pass through and stray under a node.
const edge = (points: Waypoint[], offset: number) => {
    const runs = points
        .slice(1)
        .map(
            (point, at) => (point.y - points[at].y) / (point.x - points[at].x),
        );
    const slopes = points.map((_, at) => {
        if (at === 0 || at === points.length - 1) return 0;
        const [before, after] = [runs[at - 1], runs[at]];
        return before * after <= 0
            ? 0
            : (2 * before * after) / (before + after);
    });

    const y = (at: number) => points[at].y + offset;
    let path = `M${points[0].x},${y(0)}`;
    for (let at = 0; at < points.length - 1; at += 1) {
        const reach = (points[at + 1].x - points[at].x) / 3;
        path +=
            ` C${points[at].x + reach},${y(at) + slopes[at] * reach}` +
            ` ${points[at + 1].x - reach},${y(at + 1) - slopes[at + 1] * reach}` +
            ` ${points[at + 1].x},${y(at + 1)}`;
    }
    return path;
};

// A whole ribbon as one shape. Drawing it in pieces left a seam at every join
// that Firefox antialiases into a visible white line.
const ribbonPath = (points: Waypoint[], thickness: number) => {
    const half = Math.max(1, thickness) / 2;
    const back = edge([...points].reverse(), half).replace(/^M/, "L");
    return `${edge(points, -half)} ${back} Z`;
};

const gradientId = (from: string, to: string) => `flow-${from}-${to}`;

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

// A threaded ribbon is several links, all of which name the move it really is
// rather than the invisible nodes they happen to run between.
const LinkTip = ({
    link,
    ends,
}: {
    link: SankeyLinkDatum<FlowNode, FlowLink>;
    ends: Map<string, SankeyNodeDatum<FlowNode, FlowLink>>;
}) => (
    <Tip>
        <span className="font-medium">{ends.get(link.from)?.name}</span>
        <span className="text-sub"> to </span>
        <span className="font-medium">{ends.get(link.to)?.name}</span>
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
        {nodes
            .filter((node) => !node.via)
            .map((node) => (
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
// The count trails the name by a fixed gap, in the lighter of the two weights.
const VALUE_GAP = 3;
const NAME_WEIGHT = 500;
const VALUE_WEIGHT = 400;

// Canvas measures text with the same font engine that lays out the SVG, so a
// label can size its own plate as it renders. Measuring the rendered glyphs
// instead would agree to a fraction of a pixel, but only a render later, and
// until then the labels have no plate: long enough to be captured that way by
// anything exporting the chart.
let pen: CanvasRenderingContext2D | undefined;
let labelFont: string | undefined;

const measureLabel = (content: string, weight: number) => {
    // Only ever null for a canvas already holding a context of another type.
    pen ??= document
        .createElement("canvas")
        .getContext("2d") as CanvasRenderingContext2D;
    labelFont ??= getComputedStyle(document.documentElement).fontFamily;
    pen.font = `${weight} ${LABEL_SIZE}px ${labelFont}`;
    return pen.measureText(content);
};

// Labels land on top of ribbons, so each sits on a plate of the background
// colour, matching the landing page's chart. SVG has no box around text, so the
// plate is drawn from the measured width of the two runs and the font's own
// height, which is what makes every plate the same depth.
const FlowLabel = ({
    node,
    select,
}: {
    node: FlowNodeDatum;
    select: SelectNode;
}) => {
    const hover = useNodeHover(node, select);
    const opening = node.depth === 0;
    const x = opening ? node.x0 - LABEL_GAP : node.x1 + LABEL_GAP;
    const y = (node.y0 + node.y1) / 2;

    const value = `· ${node.value}`;
    const name = measureLabel(node.name, NAME_WEIGHT);
    const count = measureLabel(value, VALUE_WEIGHT);
    const width = name.width + VALUE_GAP + count.width;
    const height = count.fontBoundingBoxAscent + count.fontBoundingBoxDescent;

    return (
        <g {...hover}>
            <rect
                x={(opening ? x - width : x) - PLATE_X}
                y={y - height / 2 - PLATE_Y}
                width={width + PLATE_X * 2}
                height={height + PLATE_Y * 2}
                fill="var(--color-background)"
                fillOpacity={0.85}
            />
            <text
                x={x}
                y={y}
                textAnchor={opening ? "end" : "start"}
                dominantBaseline="central"
                fontSize={LABEL_SIZE}
            >
                <tspan fill="var(--color-ink)" fontWeight={NAME_WEIGHT}>
                    {node.name}
                </tspan>
                <tspan dx={VALUE_GAP} fill="var(--color-sub)">
                    {value}
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
        {nodes
            .filter((node) => !node.via)
            .map((node) => (
                <FlowLabel key={node.id} node={node} select={setCurrentNode} />
            ))}
    </g>
);

// Replacing the built-in link layer means its hover handling goes with it, so
// the ribbons wire up their own; without this only nodes would have a tooltip.
const Ribbons: SankeyCustomLayer<FlowNode, FlowLink> = ({ links, nodes }) => {
    const { showTooltipFromEvent, hideTooltip } = useTooltip();
    const ends = new Map(nodes.map((node) => [node.id, node]));

    // Gather the pieces a threaded ribbon was cut into and follow them across,
    // taking a point where it leaves each column, so the whole run can be drawn
    // as one shape.
    const chains = new Map<string, typeof links>();
    for (const link of links) {
        const ribbon = `${link.from} ${link.to}`;
        chains.set(ribbon, [...(chains.get(ribbon) ?? []), link]);
    }

    const ribbons = [...chains.values()].map((pieces) => {
        const run = [...pieces].sort((a, b) => a.source.x1 - b.source.x1);
        const last = run[run.length - 1];
        const points: Waypoint[] = [
            { x: run[0].source.x1 - BLEED, y: run[0].pos0 },
            ...run.slice(0, -1).map((piece) => ({
                x: (piece.target.x0 + piece.target.x1) / 2,
                y: piece.pos1,
            })),
            { x: last.target.x0 + BLEED, y: last.pos1 },
        ];
        return {
            link: run[0],
            from: run[0].from,
            to: last.to,
            path: ribbonPath(points, run[0].thickness),
        };
    });

    return (
        <g>
            <defs>
                {ribbons.map(({ from, to }) => (
                    <linearGradient
                        key={gradientId(from, to)}
                        id={gradientId(from, to)}
                        x1="0%"
                        x2="100%"
                        y1="0%"
                        y2="0%"
                    >
                        <stop offset="0%" stopColor={ends.get(from)?.color} />
                        <stop offset="100%" stopColor={ends.get(to)?.color} />
                    </linearGradient>
                ))}
            </defs>
            {ribbons.map(({ link, from, to, path }) => {
                const tip = (event: MouseEvent<SVGElement>) =>
                    showTooltipFromEvent(
                        <LinkTip link={link} ends={ends} />,
                        event,
                    );
                return (
                    <path
                        key={gradientId(from, to)}
                        d={path}
                        fill={`url(#${gradientId(from, to)})`}
                        fillOpacity={0.55}
                        onMouseEnter={tip}
                        onMouseMove={tip}
                        onMouseLeave={hideTooltip}
                    />
                );
            })}
        </g>
    );
};

type FlowGraph = Omit<ReturnType<typeof graphFrom>, "columns">;

const CHART_PROPS: Omit<
    SankeySvgProps<FlowNode, FlowLink>,
    "data" | "width" | "height"
> = {
    // Each node belongs to a fixed position in the journey, so depth is counted
    // from the left rather than pushing whatever stops early over to the right
    // edge.
    align: "start",
    margin: MARGIN,
    colors: (node) => node.fill,
    layers: [Ribbons, Nodes, Labels],
    nodeThickness: NODE_THICKNESS,
    nodeSpacing: 28,
    animate: false,
    theme: {
        // Nivo paints this behind the chart, which is what gives an exported
        // SVG its background.
        background: "var(--color-background)",
        text: { fontFamily: "inherit", fontSize: LABEL_SIZE },
    },
};

// Fixed rather than responsive so the popup and the file it saves are the same
// picture on every screen.
const ExpandedChart = ({
    graph,
    columns,
    ref,
}: {
    graph: FlowGraph;
    columns: number;
    ref?: Ref<HTMLDivElement>;
}) => {
    const width = expandedWidth(columns);

    return (
        <div
            ref={ref}
            style={{ width, height: EXPANDED_HEIGHT }}
            className="bg-background"
        >
            <Sankey
                {...CHART_PROPS}
                data={graph}
                width={width}
                height={EXPANDED_HEIGHT}
            />
        </div>
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

const svgMarkup = (chart: HTMLElement) => {
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

type ExportFormat = "png" | "svg";

const chartHref = async (node: HTMLElement, format: ExportFormat) => {
    if (format === "svg") {
        const markup = svgMarkup(node);
        if (!markup) throw new Error("The chart has no SVG to serialise.");
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    }

    const background =
        getComputedStyle(document.documentElement)
            .getPropertyValue("--color-background")
            .trim() || "#ffffff";
    return toPng(node, { pixelRatio: 2, backgroundColor: background });
};

const saveFile = (href: string, filename: string) => {
    const link = document.createElement("a");
    link.download = filename;
    link.href = href;
    link.click();
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

const headerButtonClass =
    "cursor-pointer p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

const DownloadMenu = ({
    busy,
    onSelect,
}: {
    busy: boolean;
    onSelect: (format: ExportFormat) => void;
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    const pick = (format: ExportFormat) => {
        setOpen(false);
        onSelect(format);
    };

    return (
        <div
            ref={menuRef}
            onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
            className="relative"
        >
            <button
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Download this chart"
                title="Download"
                className={headerButtonClass}
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--download] block size-4"
                />
            </button>
            {open && (
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
                        onSelect={() => pick("png")}
                    />
                    <ExportOption
                        format="SVG"
                        icon="icon-[lucide--vector-square]"
                        note="Vector image"
                        onSelect={() => pick("svg")}
                    />
                </div>
            )}
        </div>
    );
};

// Native <dialog> rather than a hand-rolled overlay: showModal gives the focus
// trap, Escape handling, inert background and top-layer stacking for free.
const ExpandedDialog = ({
    graph,
    columns,
    total,
    busy,
    chartRef,
    onDownload,
    onClose,
}: {
    graph: FlowGraph;
    columns: number;
    total: number;
    busy: boolean;
    chartRef: Ref<HTMLDivElement>;
    onDownload: (format: ExportFormat) => void;
    onClose: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();

    return (
        <dialog
            ref={dialogRef}
            aria-label="Sankey"
            onCancel={(event) => {
                event.preventDefault();
                close(onClose);
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) close(onClose);
            }}
            className="m-auto flex max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)] flex-col border border-hairline bg-background backdrop:bg-ink/25"
        >
            <div className="flex h-10 shrink-0 items-center justify-between gap-6 border-b border-hairline px-4">
                <h2 className="text-xs font-medium text-muted">Sankey</h2>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-sub tabular-nums">
                        {total} total
                    </span>
                    <DownloadMenu busy={busy} onSelect={onDownload} />
                    <button
                        type="button"
                        onClick={() => close(onClose)}
                        aria-label="Close this chart"
                        title="Close"
                        className={headerButtonClass}
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--x] block size-4"
                        />
                    </button>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
                <ExpandedChart ref={chartRef} graph={graph} columns={columns} />
            </div>
        </dialog>
    );
};

export const PipelineFlow = ({
    flow,
    name,
}: {
    flow: FlowEntry[];
    name: string;
}) => {
    const exportRef = useRef<HTMLDivElement>(null);
    const [pending, setPending] = useState<ExportFormat | null>(null);
    const [expanded, setExpanded] = useState(false);
    const { columns, ...graph } = graphFrom(flow);
    const chartable = graph.links.length > 0;

    useEffect(() => {
        if (!pending) return;
        void (async () => {
            try {
                const chart = exportRef.current;
                if (chart)
                    saveFile(
                        await chartHref(chart, pending),
                        `${fileSlug(name)}-sankey.${pending}`,
                    );
            } catch {
                toast.error("Could not export the chart.");
            } finally {
                setPending(null);
            }
        })();
    }, [pending, name]);

    return (
        <section className="border border-hairline bg-background">
            <div className="flex h-10 items-center justify-between border-b border-hairline px-4">
                <h2 className="text-xs font-medium text-muted">Sankey</h2>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-sub tabular-nums">
                        {flow.length} total
                    </span>
                    {chartable && (
                        <>
                            <button
                                type="button"
                                onClick={() => setExpanded(true)}
                                aria-label="Open this chart larger"
                                title="Expand"
                                className={headerButtonClass}
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--maximize-2] block size-4"
                                />
                            </button>
                            <DownloadMenu
                                busy={!!pending}
                                onSelect={setPending}
                            />
                        </>
                    )}
                </div>
            </div>
            {!chartable ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    Not enough activity to chart yet.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <div
                        style={{ minWidth: chartWidth(columns) }}
                        className="h-160 px-4 py-4"
                    >
                        <ResponsiveSankey {...CHART_PROPS} data={graph} />
                    </div>
                </div>
            )}
            {expanded && (
                <ExpandedDialog
                    graph={graph}
                    columns={columns}
                    total={flow.length}
                    busy={!!pending}
                    chartRef={exportRef}
                    onDownload={setPending}
                    onClose={() => setExpanded(false)}
                />
            )}
            {/* A download always captures the expanded chart, so when the popup
                is closed one is drawn off-screen just long enough to save. */}
            {!!pending && !expanded && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none fixed top-0 left-0 -translate-x-full"
                >
                    <ExpandedChart
                        ref={exportRef}
                        graph={graph}
                        columns={columns}
                    />
                </div>
            )}
        </section>
    );
};
