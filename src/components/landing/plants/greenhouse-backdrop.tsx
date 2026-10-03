"use client";

import { useEffect, useRef } from "react";
import { greenhousePath } from "./plants";
import { motionAllowed } from "./pointer-wind";
import { SwayingFerns } from "./swaying-ferns";

// The greenhouse front is one bay, repeated across the band from its centre
// at the band's height, so it fills any width with whole arches in the
// middle. It is a mask over a fill in the token colour, and a second mask
// fades it out behind the copy.
const BAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 416" width="230" height="416"><path d="${greenhousePath({ width: 230, height: 416, bays: 1 })}" fill="none" stroke="black" stroke-width="1.5"/></svg>`;
const GREENHOUSE_MASK = {
    maskImage: `url("data:image/svg+xml,${encodeURIComponent(BAY)}"), radial-gradient(ellipse 33% 42% at 50% 50%, transparent 35%, black)`,
    maskSize: "auto 100%, 100% 100%",
    maskRepeat: "repeat-x, no-repeat",
    maskPosition: "center bottom, center",
    maskComposite: "intersect",
};

// Each clump's base sits on the band's floor at (0, 0).
const FERNS = [
    { length: 270, angle: -80, curl: 55 },
    { length: 220, angle: -118, curl: -34 },
];
const FERN_BOX = "-165 -205 330 205";

// As the band scrolls into view the reader walks up to the greenhouse. Its
// front settles from a little larger to its own size, scaling about the
// bottom so it always fills the band, while the ferns in front rise into
// place from below the floor, moving further than the glass behind them, and
// the light through the glass grows. Progress runs from the band's top
// reaching the bottom of the screen to the whole band being in view.
const APPROACH_SCALE = 0.14;
const FERN_RISE_PX = 48;
const GLOW = { from: 0.12, to: 0.3 };
// Shown progress eases toward the scroll position over about this long, in
// seconds, so the scene trails the scroll softly instead of snapping with it.
const EASE = 0.18;

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const smooth = (t: number) => t * t * (3 - 2 * t);

export const GreenhouseBackdrop = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);
    const archesRef = useRef<HTMLDivElement>(null);
    const fernsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const glow = glowRef.current;
        const arches = archesRef.current;
        const ferns = fernsRef.current;
        if (!root || !glow || !arches || !ferns || !motionAllowed()) return;

        const progress = () => {
            const box = root.getBoundingClientRect();
            return clamp01((window.innerHeight - box.top) / box.height);
        };
        const show = (p: number) => {
            const e = smooth(p);
            arches.style.transform = `scale(${(1 + APPROACH_SCALE * (1 - e)).toFixed(4)})`;
            ferns.style.transform = `translateY(${(FERN_RISE_PX * (1 - e)).toFixed(1)}px)`;
            glow.style.opacity = (
                GLOW.from +
                (GLOW.to - GLOW.from) * e
            ).toFixed(3);
        };

        // Start wherever the page already is, with no animation on load.
        let target = progress();
        let shown = target;
        show(shown);

        let frame = 0;
        let last = 0;
        const tick = (now: number) => {
            const dt = Math.min((now - last) / 1000, 1 / 30);
            last = now;
            shown += (target - shown) * (1 - Math.exp(-dt / EASE));
            if (Math.abs(target - shown) < 0.001) shown = target;
            show(shown);
            frame = shown === target ? 0 : requestAnimationFrame(tick);
        };
        const onScroll = () => {
            target = progress();
            if (frame || target === shown) return;
            last = performance.now();
            frame = requestAnimationFrame(tick);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            cancelAnimationFrame(frame);
        };
    }, []);

    // The finished scene is what renders first, for the server, for no
    // JavaScript, and for reduced motion.
    return (
        <div
            ref={rootRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
        >
            <div
                ref={glowRef}
                className="absolute inset-0 [background:radial-gradient(70%_90%_at_50%_100%,var(--color-accent-deep),transparent)] opacity-30"
            />
            <div
                ref={archesRef}
                style={GREENHOUSE_MASK}
                className="absolute inset-0 origin-bottom bg-accent-deep/60"
            />
            {/* The ferns are opaque, so they hide the glazing bars behind
                them. */}
            <div ref={fernsRef} className="absolute inset-0">
                <SwayingFerns
                    fronds={FERNS}
                    viewBox={FERN_BOX}
                    className="absolute bottom-0 -left-12 h-28 w-auto overflow-visible sm:-left-6 sm:h-44 lg:h-52"
                />
                <SwayingFerns
                    fronds={FERNS}
                    mirror
                    viewBox={FERN_BOX}
                    className="absolute bottom-0 -right-12 h-28 w-auto overflow-visible sm:-right-6 sm:h-44 lg:h-52"
                />
            </div>
        </div>
    );
};
