"use client";

import { useEffect, useRef } from "react";
import { fernClump } from "./plants";
import { startSway, type Joint } from "./sway";

// Each frond in a clump sways from its base on the ground, slowly and damped
// past critical.
const FROND = { stiffness: 10, damping: 8, wind: 0.34, max: 6 };
// How far from a frond the wind is felt, in SVG units.
const REACH = 180;

export const SwayingFerns = ({
    fronds,
    mirror = false,
    viewBox,
    className,
}: {
    fronds: Parameters<typeof fernClump>[0];
    // Draw the clump facing the other way, for the right-hand corner.
    mirror?: boolean;
    viewBox: string;
    className?: string;
}) => {
    const clump = fernClump(fronds);
    const clumpRef = useRef(clump);
    const svgRef = useRef<SVGSVGElement>(null);
    const rootRef = useRef<SVGGElement>(null);
    const frondRefs = useRef<(SVGPathElement | null)[]>([]);

    useEffect(() => {
        const svg = svgRef.current;
        const root = rootRef.current;
        if (!svg || !root) return;
        const joints: Joint[] = clumpRef.current.map(({ tip }) => ({
            pivot: { x: 0, y: 0 },
            end: tip,
            ...FROND,
        }));
        return startSway({
            svg,
            local: root,
            joints,
            reach: REACH,
            draw: (angles) => {
                angles.forEach((angle, i) => {
                    frondRefs.current[i]?.setAttribute(
                        "transform",
                        `rotate(${angle.toFixed(2)})`,
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
            <g
                transform={mirror ? "scale(-1 1)" : undefined}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-accent-deep"
            >
                <g ref={rootRef}>
                    {clump.map((frond, i) => (
                        <path
                            key={i}
                            ref={(element) => {
                                frondRefs.current[i] = element;
                            }}
                            d={frond.d}
                            strokeWidth={frond.width}
                        />
                    ))}
                </g>
            </g>
        </svg>
    );
};
