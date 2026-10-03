"use client";

import { useEffect, useRef } from "react";
import { treeRings } from "./plants";
import { motionAllowed } from "./pointer-wind";

// The tree rings beside the History panel, one ring per change with the
// newest outermost. They move three ways:
// - When they first scroll into view they draw themselves, one ring at a
//   time from the pith outward. Never on page load: rings already on screen
//   when the page opens are simply there.
// - Hovering a change in the panel lights its ring, and hovering the restore
//   point fades the rings a restore would undo and lights the one it returns
//   to.
// - Hovering the rings themselves lights the ring under the pointer, fading
//   into its neighbours. Over the panel this gives way to the panel's rows,
//   since the rings behind the panel cannot be seen.
// A ring shows whichever light on it is stronger.

// The History panel's rows after its header, newest first: three changes,
// the restore marker, then two older changes.
const PANEL_ROWS = [
    "change",
    "change",
    "change",
    "restore",
    "change",
    "change",
] as const;
// A restore to the marker undoes the changes above it.
const UNDONE = PANEL_ROWS.indexOf("restore");
// How faint a ring a restore would undo becomes.
const UNDONE_OPACITY = "0.15";

// How far either side of a ring the pointer's light reaches, in SVG units.
const TRACE_WIDTH = 16;
// How quickly a ring's light follows, in seconds.
const LIGHT_EASE = 0.12;

// How long each ring takes to draw, and how far apart they start.
const GROW_MS = 1200;
const GROW_STAGGER_MS = 110;

export const TreeRings = ({
    options,
    viewBox,
    className,
}: {
    options: Parameters<typeof treeRings>[0];
    viewBox: string;
    className?: string;
}) => {
    const rings = treeRings(options);
    const ringsRef = useRef(rings);
    const svgRef = useRef<SVGSVGElement>(null);
    const rootRef = useRef<SVGGElement>(null);
    const ringRefs = useRef<(SVGPathElement | null)[]>([]);
    const glowRefs = useRef<(SVGPathElement | null)[]>([]);

    useEffect(() => {
        const svg = svgRef.current;
        const root = rootRef.current;
        const host = svg?.closest("section");
        // The panel is drawn right after the rings, which sit behind it.
        const panel = svg?.nextElementSibling;
        if (!svg || !root || !host || !panel) return;
        const shapes = ringsRef.current;
        const count = shapes.length;
        const bases = ringRefs.current;
        const glows = glowRefs.current;

        // Each ring's light from the panel and from the pointer, and the
        // light it shows, which eases toward the stronger of the two.
        const fromPanel = new Float64Array(count);
        const fromPointer = new Float64Array(count);
        const lights = new Float64Array(count);
        let frame = 0;
        let last = 0;
        const tick = (now: number) => {
            const dt = Math.min((now - last) / 1000, 1 / 30);
            last = now;
            const ease = 1 - Math.exp(-dt / LIGHT_EASE);
            let moving = false;
            for (let i = 0; i < count; i++) {
                const target = Math.max(fromPanel[i], fromPointer[i]);
                lights[i] += (target - lights[i]) * ease;
                if (Math.abs(target - lights[i]) > 0.005) moving = true;
                else lights[i] = target;
                glows[i]?.style.setProperty("opacity", lights[i].toFixed(3));
            }
            frame = moving ? requestAnimationFrame(tick) : 0;
        };
        const relight = () => {
            if (frame) return;
            last = performance.now();
            frame = requestAnimationFrame(tick);
        };

        const showRow = (row: number | null) => {
            fromPanel.fill(0);
            bases.forEach((base) => base?.style.setProperty("opacity", "1"));
            if (row !== null && row >= 0 && row < PANEL_ROWS.length) {
                if (PANEL_ROWS[row] === "restore") {
                    for (let k = 0; k < UNDONE; k++) {
                        bases[count - 1 - k]?.style.setProperty(
                            "opacity",
                            UNDONE_OPACITY,
                        );
                    }
                    fromPanel[count - 1 - UNDONE] = 1;
                } else {
                    const change = PANEL_ROWS.slice(0, row).filter(
                        (kind) => kind === "change",
                    ).length;
                    fromPanel[count - 1 - change] = 1;
                }
            }
            relight();
        };
        const onPanelOver = (event: Event) => {
            let row = event.target as Element | null;
            while (row && row.parentElement !== panel) {
                row = row.parentElement;
            }
            // The panel's first child is its header.
            showRow(row ? Array.from(panel.children).indexOf(row) - 1 : null);
        };
        const onPanelLeave = () => showRow(null);

        const onMove = (event: PointerEvent) => {
            const matrix = root.getScreenCTM();
            if (!matrix || svg.getBoundingClientRect().width === 0) return;
            const overPanel = panel.contains(event.target as Node);
            const p = new DOMPoint(
                event.clientX,
                event.clientY,
            ).matrixTransform(matrix.inverse());
            const outer = shapes[count - 1];
            const beyond =
                Math.hypot(p.x - outer.centre.x, p.y - outer.centre.y) >
                outer.radius + TRACE_WIDTH * 2;
            shapes.forEach(({ centre, radius }, i) => {
                const off = Math.hypot(p.x - centre.x, p.y - centre.y) - radius;
                fromPointer[i] =
                    overPanel || beyond
                        ? 0
                        : Math.exp(-((off / TRACE_WIDTH) ** 2));
            });
            relight();
        };
        const onLeave = () => {
            fromPointer.fill(0);
            relight();
        };

        panel.addEventListener("pointerover", onPanelOver);
        panel.addEventListener("pointerleave", onPanelLeave);
        host.addEventListener("pointermove", onMove, { passive: true });
        host.addEventListener("pointerleave", onLeave);

        // Draw the rings in when they are first scrolled to, unless they are
        // already on screen.
        let observer: IntersectionObserver | null = null;
        const box = svg.getBoundingClientRect();
        if (
            motionAllowed() &&
            (box.bottom <= 0 || box.top >= window.innerHeight)
        ) {
            const strokes = [...bases, ...glows];
            strokes.forEach((stroke) => {
                stroke?.style.setProperty("stroke-dasharray", "1");
                stroke?.style.setProperty("stroke-dashoffset", "1");
            });
            observer = new IntersectionObserver(
                ([entry]) => {
                    if (!entry.isIntersecting) return;
                    observer?.disconnect();
                    strokes.forEach((stroke, i) => {
                        const delay = (i % count) * GROW_STAGGER_MS;
                        // The rings keep their fade for the restore point;
                        // the lit copies are eased by the light loop alone.
                        const fade = i < count ? ", opacity 500ms" : "";
                        stroke?.style.setProperty(
                            "transition",
                            `stroke-dashoffset ${GROW_MS}ms cubic-bezier(0.3, 0.6, 0.3, 1) ${delay}ms${fade}`,
                        );
                        stroke?.style.setProperty("stroke-dashoffset", "0");
                    });
                },
                { threshold: 0.3 },
            );
            observer.observe(svg);
        }

        return () => {
            panel.removeEventListener("pointerover", onPanelOver);
            panel.removeEventListener("pointerleave", onPanelLeave);
            host.removeEventListener("pointermove", onMove);
            host.removeEventListener("pointerleave", onLeave);
            cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    }, []);

    return (
        <svg
            ref={svgRef}
            aria-hidden="true"
            viewBox={viewBox}
            fill="none"
            strokeWidth="1"
            className={className}
        >
            <g ref={rootRef}>
                {rings.map((ring, i) => (
                    <path
                        key={i}
                        ref={(element) => {
                            ringRefs.current[i] = element;
                        }}
                        d={ring.d}
                        pathLength={1}
                        stroke="currentColor"
                        vectorEffect="non-scaling-stroke"
                        className="transition-opacity duration-500"
                    />
                ))}
                {/* A darker copy of each ring, hidden until it is lit. */}
                {rings.map((ring, i) => (
                    <path
                        key={i}
                        ref={(element) => {
                            glowRefs.current[i] = element;
                        }}
                        d={ring.d}
                        pathLength={1}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        className="stroke-accent-deep opacity-0"
                    />
                ))}
            </g>
        </svg>
    );
};
