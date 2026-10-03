"use client";

import { useEffect, useRef } from "react";
import {
    taperPath,
    VINE_STEM,
    vineParts,
    type Vec,
    type VineOptions,
} from "./plants";
import { startSway, type Joint } from "./sway";

// A vine swings from where it hangs: the top barely moves and the end moves
// most, trailing a little behind. Two joints carry that, one for the whole
// vine's swing and a softer, slower one for its lower part. A point t of the
// way down the stem turns about the top by swing * t + trail * t^2.5, so the
// stem curves rather than swinging stiff. Both are felt along the vine's
// hanging line, so sideways wind moves it and wind along it does not.
const SWING = { stiffness: 12, damping: 9, wind: 0.3, max: 8 };
const TRAIL = { stiffness: 6, damping: 6.4, wind: 0.28, max: 12 };
// How far from a vine the pointer is felt, in SVG units.
const REACH = 120;

const turnAboutTop = (p: Vec, degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    return {
        x: p.x * Math.cos(a) - p.y * Math.sin(a),
        y: p.x * Math.sin(a) + p.y * Math.cos(a),
    };
};

export const SwayingVines = ({
    vines,
    viewBox,
    className,
}: {
    // Each vine's shape, and how far along x it hangs from.
    vines: (VineOptions & { x: number })[];
    viewBox: string;
    className?: string;
}) => {
    const parts = vines.map((vine) => ({ ...vineParts(vine), x: vine.x }));
    const partsRef = useRef(parts);
    const svgRef = useRef<SVGSVGElement>(null);
    const rootRef = useRef<SVGGElement>(null);
    const stemRefs = useRef<(SVGPathElement | null)[]>([]);
    const leafRefs = useRef<(SVGPathElement | null)[][]>([]);

    useEffect(() => {
        const svg = svgRef.current;
        const root = rootRef.current;
        if (!svg || !root) return;
        const shapes = partsRef.current;
        const joints: Joint[] = shapes.flatMap(({ stem, x }) => {
            const line = {
                pivot: { x, y: 0 },
                end: { x, y: stem[stem.length - 1].y },
            };
            return [
                { ...line, ...SWING },
                { ...line, ...TRAIL },
            ];
        });
        return startSway({
            svg,
            local: root,
            joints,
            reach: REACH,
            draw: (angles) => {
                shapes.forEach(({ stem, leaves }, v) => {
                    const swing = angles[v * 2];
                    const trail = angles[v * 2 + 1];
                    const end = stem.length - 1;
                    const angle = (i: number) =>
                        swing * (i / end) + trail * Math.pow(i / end, 2.5);
                    const moved = stem.map((p, i) => turnAboutTop(p, angle(i)));
                    stemRefs.current[v]?.setAttribute(
                        "d",
                        taperPath(moved, VINE_STEM.from, VINE_STEM.to),
                    );
                    leaves.forEach(({ at }, k) => {
                        const from = stem[at];
                        const to = moved[at];
                        leafRefs.current[v]?.[k]?.setAttribute(
                            "transform",
                            `translate(${(to.x - from.x).toFixed(2)} ${(to.y - from.y).toFixed(2)}) ` +
                                `rotate(${angle(at).toFixed(2)} ${from.x.toFixed(1)} ${from.y.toFixed(1)})`,
                        );
                    });
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
                {parts.map(({ stem, leaves, x }, v) => (
                    // Solid paths faded as one group, so the leaves, drawn
                    // apart from the stem, do not darken where they overlap it.
                    <g
                        key={v}
                        transform={`translate(${x} 0)`}
                        className="fill-accent opacity-25"
                    >
                        <path
                            ref={(element) => {
                                stemRefs.current[v] = element;
                            }}
                            d={taperPath(stem, VINE_STEM.from, VINE_STEM.to)}
                        />
                        {leaves.map((leaf, k) => (
                            <path
                                key={k}
                                ref={(element) => {
                                    (leafRefs.current[v] ??= [])[k] = element;
                                }}
                                d={leaf.d}
                            />
                        ))}
                    </g>
                ))}
            </g>
        </svg>
    );
};
