import type { Vec } from "./plants";
import { followWind, GUST_MS, motionAllowed, type Gust } from "./pointer-wind";

// One part of a plant that moves in the pointer's wind. It turns about
// `pivot`, and the wind is felt along the line from `pivot` to `end`: wind
// across that line turns it, wind along it does not. A `push` joint answers
// only to how hard the wind blows, for parts that swell rather than turn.
// Angles are in degrees and time in seconds. Every plant here uses springs
// damped past critical, so nothing swings back past rest.
export type Joint = {
    pivot: Vec;
    end: Vec;
    stiffness: number;
    damping: number;
    wind: number;
    max: number;
    push?: boolean;
};

// The wind on each joint builds and fades over about this long, in seconds,
// rather than switching on and off as the pointer passes.
const FORCE_EASE = 0.25;

const clamp = (value: number, limit: number) =>
    Math.min(Math.max(value, -limit), limit);

const distanceToSegment = (p: Vec, a: Vec, b: Vec) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.min(
        Math.max(
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
            0,
        ),
        1,
    );
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};

// Moves `joints` in the wind of the pointer over the section around `svg`,
// in the coordinates of `local`, and calls `draw` every frame while anything
// moves. The first `coupled` joints pull on their neighbours by `coupling`,
// so a gust spreads along them. `linger` keeps drawing that many milliseconds
// after the joints settle, for drawings that trail the joints. `draw` gets
// `resting` once everything is back at rest. Returns a function that stops.
export const startSway = ({
    svg,
    local,
    joints,
    reach,
    draw,
    coupled = 0,
    coupling = 0,
    linger = 0,
}: {
    svg: SVGSVGElement;
    local: SVGGraphicsElement;
    joints: Joint[];
    // How far from a joint the wind is felt, in the coordinates of `local`.
    reach: number;
    draw: (angles: Float64Array, now: number, resting: boolean) => void;
    coupled?: number;
    coupling?: number;
    linger?: number;
}) => {
    const host = svg.closest("section") ?? svg.parentElement;
    if (!host || !motionAllowed()) return () => {};

    const count = joints.length;
    const angles = new Float64Array(count);
    const speeds = new Float64Array(count);
    const forces = new Float64Array(count);
    const units = joints.map(({ pivot, end }) => {
        const dx = end.x - pivot.x;
        const dy = end.y - pivot.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: dx / length, y: dy / length };
    });
    let gust: Gust | null = null;
    let frame = 0;
    let last = 0;
    let quietSince: number | null = null;

    const tick = (now: number) => {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        const blowing = gust !== null && now - gust.at < GUST_MS;
        const ease = 1 - Math.exp(-dt / FORCE_EASE);
        let energy = 0;
        for (let i = 0; i < count; i++) {
            const joint = joints[i];
            let target = 0;
            if (blowing && gust) {
                const distance = distanceToSegment(
                    gust,
                    joint.pivot,
                    joint.end,
                );
                const falloff = Math.exp(
                    -(distance * distance) / (reach * reach),
                );
                const drive = joint.push
                    ? Math.hypot(gust.vx, gust.vy)
                    : units[i].x * gust.vy - units[i].y * gust.vx;
                target = drive * falloff * joint.wind;
            }
            forces[i] += (target - forces[i]) * ease;
            const neighbour = (j: number) =>
                j >= 0 && j < coupled ? angles[j] : angles[i];
            const pull =
                i < coupled
                    ? (neighbour(i - 1) + neighbour(i + 1) - 2 * angles[i]) *
                      coupling
                    : 0;
            speeds[i] +=
                (forces[i] +
                    pull -
                    joint.stiffness * angles[i] -
                    joint.damping * speeds[i]) *
                dt;
            angles[i] = clamp(angles[i] + speeds[i] * dt, joint.max);
            energy +=
                Math.abs(angles[i]) +
                Math.abs(speeds[i]) * 0.02 +
                Math.abs(forces[i]) * 0.01;
        }

        const moving = blowing || energy > 0.05;
        if (moving) quietSince = null;
        else quietSince ??= now;
        if (moving || now - (quietSince ?? now) < linger) {
            draw(angles, now, false);
            frame = requestAnimationFrame(tick);
            return;
        }
        // Settled: come to rest exactly and stop until the next gust.
        angles.fill(0);
        speeds.fill(0);
        forces.fill(0);
        quietSince = null;
        draw(angles, now, true);
        frame = 0;
    };

    const stop = followWind(host, svg, local, (next) => {
        gust = next;
        if (!frame) {
            last = performance.now();
            frame = requestAnimationFrame(tick);
        }
    });
    return () => {
        stop();
        cancelAnimationFrame(frame);
    };
};
