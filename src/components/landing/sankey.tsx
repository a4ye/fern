import type { CSSProperties } from "react";
import {
    buildSankey,
    sankeyRibbon,
    type SankeyLinkSpec,
    type SankeyNode,
    type SankeyNodeSpec,
} from "@/lib/sankey";

const W = 640;
const H = 320;
const NODE_W = 10;
const COLUMN_X = [0, 300, 630];

// One season, described as a flow rather than as coordinates: forty
// applications fan out into interviews, rejections, and silence; six
// interviews yield a single offer. Node heights and ribbon geometry are
// derived from these values.
const NODE_SPECS: SankeyNodeSpec[] = [
    {
        id: "applied",
        name: "Applied",
        column: 0,
        fill: "var(--color-accent)",
        labelSide: "start",
    },
    {
        id: "interview",
        name: "Interview",
        column: 1,
        fill: "var(--color-accent)",
        labelSide: "start",
    },
    {
        id: "offer",
        name: "Offer",
        column: 2,
        fill: "var(--color-gold)",
        labelSide: "end",
    },
    {
        id: "rejected",
        name: "Rejected",
        column: 2,
        fill: "var(--color-rose)",
        labelSide: "end",
    },
    {
        id: "noReply",
        name: "No reply",
        column: 2,
        fill: "var(--color-tile-border)",
        labelSide: "end",
    },
];

const LINK_SPECS: SankeyLinkSpec[] = [
    {
        source: "applied",
        target: "interview",
        value: 6,
        fill: "var(--color-accent)",
        opacity: 0.18,
        shine: 0.4,
    },
    {
        source: "interview",
        target: "offer",
        value: 1,
        fill: "var(--color-gold)",
        opacity: 0.4,
        shine: 0.8,
    },
    {
        source: "interview",
        target: "rejected",
        value: 5,
        fill: "var(--color-rose)",
        opacity: 0.16,
        shine: 0.36,
    },
    {
        source: "applied",
        target: "rejected",
        value: 19,
        fill: "var(--color-rose)",
        opacity: 0.13,
        shine: 0.3,
    },
    {
        source: "applied",
        target: "noReply",
        value: 15,
        fill: "var(--color-tile-border)",
        opacity: 0.5,
        shine: 0.9,
    },
];

const { nodes: NODES, links: LINKS } = buildSankey(NODE_SPECS, LINK_SPECS, {
    width: W,
    height: H,
    columnsX: COLUMN_X,
    nodeWidth: NODE_W,
});

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

const labelStyle = (node: SankeyNode): CSSProperties =>
    node.labelSide === "start"
        ? {
              top: pct(node.y + node.h / 2, H),
              left: pct(node.x + NODE_W + 8, W),
          }
        : {
              top: pct(node.y + node.h / 2, H),
              right: pct(W - node.x + 8, W),
          };

const Ribbons = ({ shine = false }: { shine?: boolean }) => (
    <>
        {LINKS.map((link, index) => (
            <path
                key={index}
                d={sankeyRibbon(link)}
                fill={link.fill}
                opacity={shine ? link.shine : link.opacity}
            />
        ))}
    </>
);

export const Sankey = () => (
    <div aria-hidden="true" className="relative aspect-[4/3] sm:aspect-[2/1]">
        <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
        >
            <Ribbons />
            {NODES.map((node) => (
                <rect
                    key={node.name}
                    x={node.x}
                    y={node.y}
                    width={NODE_W}
                    height={node.h}
                    fill={node.fill}
                />
            ))}
        </svg>
        <div className="sankey-shine absolute inset-0">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="size-full"
            >
                <Ribbons shine />
            </svg>
        </div>
        {NODES.map((node) => (
            <span
                key={node.name}
                style={labelStyle(node)}
                className="absolute -translate-y-1/2 bg-background/85 px-1.5 py-0.5 text-xs whitespace-nowrap"
            >
                <span className="font-medium text-ink">{node.name}</span>{" "}
                <span className="text-sub">· {node.count}</span>
            </span>
        ))}
    </div>
);
