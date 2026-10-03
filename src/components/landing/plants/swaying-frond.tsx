"use client";

import { useEffect, useRef } from "react";
import { frondParts } from "./plants";
import { startSway, type Joint } from "./sway";

// The hero frond. The generator is deterministic, so the server render and
// the browser build the same paths.
const FROND = frondParts({
    length: 820,
    arch: 0.9,
    spread: 0.18,
    pairs: 9,
    pinnules: 7,
});

// At rest the frond leans this far off upright, in degrees.
const LEAN = 5;

// Each pinna turns about the point where it joins the rachis on a slow spring
// damped past critical (about 0.6 swings a second), so it leans and drifts
// back. A brisk sweep across the frond leans the nearest pinnae six or seven
// degrees. Small fixed differences between pinnae keep them out of step.
const PINNAE: Joint[] = FROND.pinnae.map(({ base, tip }, i) => {
    const hash = Math.sin(i * 12.9898) * 43758.5453;
    const share = hash - Math.floor(hash);
    return {
        pivot: base,
        end: tip,
        stiffness: 14 * (0.85 + 0.3 * share),
        damping: 10,
        wind: 0.5 * (1.15 - 0.3 * share),
        max: 12,
    };
});
// The whole frond bends a little about its base too, slowly.
const BEND: Joint = {
    pivot: { x: 0, y: 0 },
    end: FROND.end,
    stiffness: 10,
    damping: 8,
    wind: 0.14,
    max: 2.5,
};
const JOINTS = [...PINNAE, BEND];
// How far from a pinna the wind is felt, in frond units: wide, so that
// neighbouring pinnae move together.
const REACH = 300;
// How strongly each pinna pulls on its neighbours. Kept small, or pinnae
// moving against each other would be under damped and wobble.
const COUPLING = 3;

export const SwayingFrond = ({
    viewBox,
    placement,
    preserveAspectRatio,
    className,
}: {
    viewBox: string;
    // Where the frond's base sits in the viewBox, as an SVG transform.
    placement: string;
    preserveAspectRatio?: string;
    className?: string;
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const groupRef = useRef<SVGGElement>(null);
    const pinnaRefs = useRef<(SVGPathElement | null)[]>([]);

    useEffect(() => {
        const svg = svgRef.current;
        const group = groupRef.current;
        if (!svg || !group) return;
        return startSway({
            svg,
            local: group,
            joints: JOINTS,
            reach: REACH,
            coupled: PINNAE.length,
            coupling: COUPLING,
            draw: (angles) => {
                PINNAE.forEach(({ pivot }, i) => {
                    pinnaRefs.current[i]?.setAttribute(
                        "transform",
                        `rotate(${angles[i].toFixed(2)} ${pivot.x.toFixed(1)} ${pivot.y.toFixed(1)})`,
                    );
                });
                group.setAttribute(
                    "transform",
                    `${placement} rotate(${(LEAN + angles[PINNAE.length]).toFixed(2)})`,
                );
            },
        });
    }, [placement]);

    return (
        <svg
            ref={svgRef}
            aria-hidden="true"
            viewBox={viewBox}
            preserveAspectRatio={preserveAspectRatio}
            className={className}
        >
            {/* Solid paths faded as one group, so the pinnae, drawn apart,
                do not darken where they overlap the rachis. */}
            <g
                ref={groupRef}
                transform={`${placement} rotate(${LEAN})`}
                className="fill-accent opacity-25"
            >
                <path d={FROND.rachis} />
                {FROND.pinnae.map((part, i) => (
                    <path
                        key={i}
                        ref={(element) => {
                            pinnaRefs.current[i] = element;
                        }}
                        d={part.d}
                    />
                ))}
                <path d={FROND.tip} />
            </g>
        </svg>
    );
};
