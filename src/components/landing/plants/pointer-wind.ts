// Turns pointer movement over a section into gusts of wind for the plant art.
// Every plant that sways uses this, so they all feel the pointer the same way.

export type Gust = { x: number; y: number; vx: number; vy: number; at: number };

// A gust lingers this long after the pointer last moved, in milliseconds.
export const GUST_MS = 120;

// Pointer speeds in the plant's own units per second. Below CALM the pointer
// makes no wind, so small adjustments of the mouse leave a plant still; above
// MAX_SPEED it is capped, so one jumpy event cannot fling it.
const CALM = 150;
const MAX_SPEED = 2500;
// Each pointer event moves the wind this share of the way toward the newly
// measured velocity, which smooths out jitter between events.
const SMOOTHING = 0.3;

export const motionAllowed = () =>
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Listens to the pointer over `host` and reports each gust in the coordinate
// space of `local`, an element inside the plant's SVG. Nothing is reported
// while `svg` is hidden, which is how a plant drawn twice for wide and narrow
// layouts only answers in the layout on screen. Returns a function that stops
// listening.
export const followWind = (
    host: HTMLElement,
    svg: SVGSVGElement,
    local: SVGGraphicsElement,
    onGust: (gust: Gust) => void,
) => {
    let wind = { vx: 0, vy: 0 };
    let previous: { x: number; y: number; t: number } | null = null;

    const onMove = (event: PointerEvent) => {
        if (svg.getBoundingClientRect().width === 0) return;
        const matrix = local.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(
            event.clientX,
            event.clientY,
        ).matrixTransform(matrix.inverse());
        const t = event.timeStamp;
        if (previous && t > previous.t) {
            const seconds = (t - previous.t) / 1000;
            wind = {
                vx:
                    wind.vx +
                    ((point.x - previous.x) / seconds - wind.vx) * SMOOTHING,
                vy:
                    wind.vy +
                    ((point.y - previous.y) / seconds - wind.vy) * SMOOTHING,
            };
            const speed = Math.hypot(wind.vx, wind.vy);
            const felt =
                speed > CALM ? (Math.min(speed, MAX_SPEED) - CALM) / speed : 0;
            onGust({
                x: point.x,
                y: point.y,
                vx: wind.vx * felt,
                vy: wind.vy * felt,
                at: performance.now(),
            });
        }
        previous = { x: point.x, y: point.y, t };
    };
    const onLeave = () => {
        previous = null;
        wind = { vx: 0, vy: 0 };
    };

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    return () => {
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
    };
};
