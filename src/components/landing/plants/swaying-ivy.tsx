"use client";

import { useEffect, useRef } from "react";
import { ivyCornerParts, type IvyPart } from "./plants";
import { startSway, type Joint } from "./sway";

// The ivy's stem holds onto the panel and stays put. Each leaf flutters about
// the point where it joins the stem, and the strand hanging over the edge
// swings from where it slipped over. All slow and damped past critical.
const LEAF = { stiffness: 16, damping: 10, wind: 0.8, max: 14 };
const STRAND = { stiffness: 8, damping: 7, wind: 0.3, max: 10 };
// How far from a leaf the wind is felt, in SVG units.
const REACH = 100;

// Each part is drawn twice, first in the page colour, so the panel's border
// does not show through the leaves.
const Part = ({
    part,
    partRef,
}: {
    part: IvyPart;
    partRef: (element: SVGGElement | null) => void;
}) => (
    <g ref={partRef}>
        <path d={part.fill} className="fill-background" />
        <path d={part.fill} className="fill-accent/40" />
        <path
            d={part.veins}
            fill="none"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="stroke-background"
        />
    </g>
);

export const SwayingIvy = ({
    options,
    viewBox,
    className,
}: {
    options: Parameters<typeof ivyCornerParts>[0];
    viewBox: string;
    className?: string;
}) => {
    const parts = ivyCornerParts(options);
    const partsRef = useRef(parts);
    const svgRef = useRef<SVGSVGElement>(null);
    const rootRef = useRef<SVGGElement>(null);
    const groupRefs = useRef<(SVGGElement | null)[]>([]);
    const moving = parts.strand
        ? [...parts.leaves, parts.strand]
        : parts.leaves;

    useEffect(() => {
        const svg = svgRef.current;
        const root = rootRef.current;
        if (!svg || !root) return;
        const { leaves, strand } = partsRef.current;
        const pieces = strand ? [...leaves, strand] : leaves;
        const joints: Joint[] = pieces.map(({ pivot, end }, i) => {
            if (i === leaves.length) return { pivot, end, ...STRAND };
            const hash = Math.sin(i * 12.9898) * 43758.5453;
            const share = hash - Math.floor(hash);
            return {
                pivot,
                end,
                ...LEAF,
                stiffness: LEAF.stiffness * (0.85 + 0.3 * share),
            };
        });
        return startSway({
            svg,
            local: root,
            joints,
            reach: REACH,
            draw: (angles) => {
                pieces.forEach(({ pivot }, i) => {
                    groupRefs.current[i]?.setAttribute(
                        "transform",
                        `rotate(${angles[i].toFixed(2)} ${pivot.x.toFixed(1)} ${pivot.y.toFixed(1)})`,
                    );
                });
            },
        });
    }, []);

    return (
        <svg
            ref={svgRef}
            aria-hidden="true"
            viewBox={viewBox}
            className={className}
        >
            <g ref={rootRef}>
                <path d={parts.stem} className="fill-background" />
                <path d={parts.stem} className="fill-accent/40" />
                {moving.map((part, i) => (
                    <Part
                        key={i}
                        part={part}
                        partRef={(element) => {
                            groupRefs.current[i] = element;
                        }}
                    />
                ))}
            </g>
        </svg>
    );
};
