import type { CSSProperties } from "react";

const W = 640;
const H = 320;
const NODE_W = 10;

type SankeyNode = {
    name: string;
    count: number;
    x: number;
    y: number;
    h: number;
    fill: string;
    labelSide: "start" | "end";
};

// Scale: 6 viewBox units per application. Same season as the word-fill
// copy and the pipeline: forty applications, six interviews, one offer.
const NODES: SankeyNode[] = [
    {
        name: "Applied",
        count: 40,
        x: 0,
        y: 40,
        h: 240,
        fill: "var(--color-accent)",
        labelSide: "start",
    },
    {
        name: "Interview",
        count: 6,
        x: 300,
        y: 28,
        h: 36,
        fill: "var(--color-accent)",
        labelSide: "start",
    },
    {
        name: "Offer",
        count: 1,
        x: 630,
        y: 18,
        h: 6,
        fill: "var(--color-gold)",
        labelSide: "end",
    },
    {
        name: "Rejected",
        count: 24,
        x: 630,
        y: 48,
        h: 144,
        fill: "var(--color-rose)",
        labelSide: "end",
    },
    {
        name: "No reply",
        count: 15,
        x: 630,
        y: 204,
        h: 90,
        fill: "var(--color-tile-border)",
        labelSide: "end",
    },
];

type SankeyLink = {
    x0: number;
    s0: number;
    s1: number;
    x1: number;
    t0: number;
    t1: number;
    fill: string;
    opacity: number;
    shine: number;
};

const LINKS: SankeyLink[] = [
    {
        x0: 10,
        s0: 40,
        s1: 76,
        x1: 300,
        t0: 28,
        t1: 64,
        fill: "var(--color-accent)",
        opacity: 0.18,
        shine: 0.4,
    },
    {
        x0: 310,
        s0: 28,
        s1: 34,
        x1: 630,
        t0: 18,
        t1: 24,
        fill: "var(--color-gold)",
        opacity: 0.4,
        shine: 0.8,
    },
    {
        x0: 310,
        s0: 34,
        s1: 64,
        x1: 630,
        t0: 48,
        t1: 78,
        fill: "var(--color-rose)",
        opacity: 0.16,
        shine: 0.36,
    },
    {
        x0: 10,
        s0: 76,
        s1: 190,
        x1: 630,
        t0: 78,
        t1: 192,
        fill: "var(--color-rose)",
        opacity: 0.13,
        shine: 0.3,
    },
    {
        x0: 10,
        s0: 190,
        s1: 280,
        x1: 630,
        t0: 204,
        t1: 294,
        fill: "var(--color-tile-border)",
        opacity: 0.5,
        shine: 0.9,
    },
];

const ribbon = ({ x0, s0, s1, x1, t0, t1 }: SankeyLink) => {
    const mx = (x0 + x1) / 2;
    return [
        `M${x0} ${s0}`,
        `C${mx} ${s0} ${mx} ${t0} ${x1} ${t0}`,
        `L${x1} ${t1}`,
        `C${mx} ${t1} ${mx} ${s1} ${x0} ${s1}`,
        "Z",
    ].join(" ");
};

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
                d={ribbon(link)}
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
