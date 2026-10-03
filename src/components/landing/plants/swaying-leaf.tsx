"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ginkgoParts, monsteraParts } from "./plants";
import { startSway, type Joint } from "./sway";

type Leaf =
    | { kind: "monstera"; options: Parameters<typeof monsteraParts>[0] }
    | { kind: "ginkgo"; options: Parameters<typeof ginkgoParts>[0] };

// A leaf on a stalk moves in two parts: the whole leaf swings from the foot of
// its stalk, and the blade flexes a little more where it meets the stalk.
// Both springs are slow and damped past critical, so the leaf leans and
// drifts back. The monstera is the heavier of the two.
const FEEL = {
    monstera: { swing: { wind: 0.26, max: 4 }, flex: { wind: 0.4, max: 6 } },
    ginkgo: { swing: { wind: 0.38, max: 6 }, flex: { wind: 0.5, max: 8 } },
};
const SWING = { stiffness: 10, damping: 8 };
const FLEX = { stiffness: 14, damping: 9.5 };
// How far from the leaf the wind is felt, in the leaf's own units.
const REACH = 220;

export const SwayingLeaf = ({
    leaf,
    viewBox,
    style,
    className,
    fill,
    veins,
    veinWidth,
    hairlineVeins = false,
}: {
    leaf: Leaf;
    viewBox: string;
    style?: CSSProperties;
    className?: string;
    // Classes for the leaf's fill, faded as one group so the stalk and blade
    // do not darken where they overlap, and for its veins.
    fill: string;
    veins: string;
    veinWidth: number;
    // Keep the veins one pixel wide however the leaf is scaled.
    hairlineVeins?: boolean;
}) => {
    const parts =
        leaf.kind === "monstera"
            ? monsteraParts(leaf.options)
            : ginkgoParts(leaf.options);
    const partsRef = useRef(parts);
    const svgRef = useRef<SVGSVGElement>(null);
    const rootRef = useRef<SVGGElement>(null);
    const swingRef = useRef<SVGGElement>(null);
    const bladeRef = useRef<SVGGElement>(null);
    const veinsRef = useRef<SVGGElement>(null);
    const kind = leaf.kind;

    useEffect(() => {
        const svg = svgRef.current;
        const root = rootRef.current;
        if (!svg || !root) return;
        const { base, tip } = partsRef.current;
        const feel = FEEL[kind];
        const joints: Joint[] = [
            { pivot: { x: 0, y: 0 }, end: tip, ...SWING, ...feel.swing },
            { pivot: base, end: tip, ...FLEX, ...feel.flex },
        ];
        return startSway({
            svg,
            local: root,
            joints,
            reach: REACH,
            draw: ([swing, flex]) => {
                swingRef.current?.setAttribute(
                    "transform",
                    `rotate(${swing.toFixed(2)})`,
                );
                const bend = `rotate(${flex.toFixed(2)} ${base.x.toFixed(1)} ${base.y.toFixed(1)})`;
                bladeRef.current?.setAttribute("transform", bend);
                veinsRef.current?.setAttribute("transform", bend);
            },
        });
    }, [kind]);

    return (
        <svg
            ref={svgRef}
            aria-hidden="true"
            viewBox={viewBox}
            style={style}
            className={className}
        >
            <g ref={rootRef}>
                <g ref={swingRef}>
                    <g className={fill}>
                        <path d={parts.stalk} />
                        <g ref={bladeRef}>
                            <path d={parts.blade} />
                        </g>
                    </g>
                    <g ref={veinsRef}>
                        <path
                            d={parts.veins}
                            fill="none"
                            strokeWidth={veinWidth}
                            vectorEffect={
                                hairlineVeins ? "non-scaling-stroke" : undefined
                            }
                            className={veins}
                        />
                    </g>
                </g>
            </g>
        </svg>
    );
};
