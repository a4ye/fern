// Procedural plant shapes for the landing page art. Each generator returns SVG
// path data, built once at module load so the markup stays static. `fill`
// paths are drawn solid; `veins` paths are thin strokes in the page colour.

export type Vec = { x: number; y: number };

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const unit = (a: Vec): Vec => mul(a, 1 / (Math.hypot(a.x, a.y) || 1));
const normal = (a: Vec): Vec => ({ x: -a.y, y: a.x });
const turn = (a: Vec, angle: number): Vec => ({
    x: a.x * Math.cos(angle) - a.y * Math.sin(angle),
    y: a.x * Math.sin(angle) + a.y * Math.cos(angle),
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const rad = (degrees: number) => (degrees * Math.PI) / 180;

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const at = (p: Vec) => `${fmt(p.x)} ${fmt(p.y)}`;
// Every closed shape is traced the same way round, the way the arcs and Bezier
// leaves below already are. Overlapping shapes traced in opposite directions
// would cancel out under the nonzero fill rule and leave holes.
const polygon = (points: Vec[]) => {
    const area = points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.y - q.x * p.y;
    }, 0);
    const ordered = area > 0 ? points.slice().reverse() : points;
    return `M${ordered.map(at).join("L")}Z`;
};
const line = (points: Vec[]) => `M${points.map(at).join("L")}`;
// A circle as a fine polygon rather than arcs, so that every path here is
// plain points that viewBoxOf can read.
const circle = (c: Vec, r: number) =>
    polygon(
        Array.from({ length: 28 }, (_, i) => {
            const t = (i / 28) * Math.PI * 2;
            return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
        }),
    );

// A small seeded random source, so a shape is the same on every render.
const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
};

const cubic = ([p0, p1, p2, p3]: Vec[], t: number): Vec => {
    const m = 1 - t;
    return add(
        add(mul(p0, m * m * m), mul(p1, 3 * m * m * t)),
        add(mul(p2, 3 * m * t * t), mul(p3, t * t * t)),
    );
};

const quadratic = ([p0, p1, p2]: Vec[], t: number): Vec => {
    const m = 1 - t;
    return add(add(mul(p0, m * m), mul(p1, 2 * m * t)), mul(p2, t * t));
};

// Direction of travel at each point of a polyline.
const headings = (points: Vec[]) =>
    points.map((_, i) =>
        unit(
            sub(
                points[Math.min(i + 1, points.length - 1)],
                points[Math.max(i - 1, 0)],
            ),
        ),
    );

// The outline of a band drawn along a centre line. `half` returns the band's
// half-width on each side of sample i, the normal side first.
const band = (points: Vec[], half: (i: number) => [number, number]) => {
    const dirs = headings(points);
    const left: Vec[] = [];
    const right: Vec[] = [];
    points.forEach((p, i) => {
        const n = normal(dirs[i]);
        const [a, b] = half(i);
        left.push(add(p, mul(n, a)));
        right.push(add(p, mul(n, -b)));
    });
    return { left, right, dirs };
};

const taper = (points: Vec[], from: number, to: number) => {
    const last = points.length - 1;
    const { left, right } = band(points, (i) => {
        const w = lerp(from, to, i / last) / 2;
        return [w, w];
    });
    return polygon([...left, ...right.reverse()]);
};

// A single blunt leaflet: the pinnule of a pinna, or a whole small pinna.
const leaflet = (base: Vec, dir: Vec, length: number, width: number) => {
    const n = normal(dir);
    const tip = add(base, mul(dir, length));
    const nearBase = add(base, mul(dir, length * 0.12));
    const nearTip = add(tip, mul(dir, -length * 0.22));
    return (
        `M${at(base)}` +
        `C${at(add(nearBase, mul(n, width * 0.72)))} ` +
        `${at(add(nearTip, mul(n, width * 0.62)))} ${at(tip)}` +
        `C${at(add(nearTip, mul(n, -width * 0.62)))} ` +
        `${at(add(nearBase, mul(n, -width * 0.72)))} ${at(base)}Z`
    );
};

// A pinna drawn as one curved, lance-shaped blade along a quadratic midrib.
const blade = (curve: Vec[], length: number) => {
    const midrib = Array.from({ length: 17 }, (_, i) =>
        quadratic(curve, i / 16),
    );
    const { left, right } = band(midrib, (i) => {
        const t = i / 16;
        const w =
            ((length * 0.17) / 2) *
            Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
        return [w, w];
    });
    return polygon([...left, ...right.reverse()]);
};

// One pinna: a midrib that sweeps toward the frond tip, lined on both sides
// with `perSide` pinnules that shrink toward its end. With none, the pinna is
// a single blade.
const pinna = (
    base: Vec,
    dir: Vec,
    towardTip: Vec,
    length: number,
    perSide: number,
) => {
    const sweep = unit(add(dir, mul(towardTip, 0.22)));
    const curve = [
        base,
        add(base, mul(dir, length * 0.5)),
        add(add(base, mul(dir, length * 0.5)), mul(sweep, length * 0.5)),
    ];

    if (perSide === 0) return [blade(curve, length)];

    const midrib = Array.from({ length: 13 }, (_, i) =>
        quadratic(curve, i / 12),
    );
    const parts = [taper(midrib, Math.max(length * 0.025, 0.6), 0.2)];
    const dirs = headings(midrib);

    // Fewer pinnules are drawn larger, so the pinna keeps its outline.
    const size0 = length * Math.min(1.6 / perSide, 0.24);
    const place = (t: number, side: 1 | -1) => {
        const p = quadratic(curve, t);
        const tangent = dirs[Math.round(t * 12)];
        const size = size0 * (1 - 0.7 * t);
        const lean = turn(tangent, side * rad(lerp(70, 48, t)));
        parts.push(leaflet(p, lean, size, size * 0.56));
    };
    const step = (j: number) =>
        0.03 + 0.85 * (1 - Math.pow(1 - j / perSide, 1.35));
    for (let j = 0; j < perSide; j++) {
        place(step(j), 1);
        place((step(j) + step(j + 1)) / 2, -1);
    }
    const end = quadratic(curve, 0.88);
    parts.push(leaflet(end, dirs[11], length * 0.15, length * 0.08));
    return parts;
};

export type FrondOptions = {
    // Height of the frond from the base of its stalk, in path units.
    length?: number;
    // How far the frond arches over to one side. 0 is upright.
    arch?: number;
    // Which way the frond arches: 1 to the right, -1 to the left.
    side?: 1 | -1;
    pairs?: number;
    // Longest pinna as a share of the frond's length.
    spread?: number;
    // Bare stalk at the base, as a share of the frond's length.
    stalk?: number;
    // Pinnules on each side of a pinna. 0 draws each pinna as one blade.
    pinnules?: number;
};

// One pinna of a frond, kept apart so that it can move on its own: its path,
// where it joins the rachis, and roughly where its tip reaches.
export type FrondPinna = { d: string; base: Vec; tip: Vec };

// A fern frond, base at (0, 0), growing up the screen (negative y), in parts:
// the rachis, each pinna, and the leaflet at the tip.
export const frondParts = ({
    length = 400,
    arch = 0.25,
    side = 1,
    pairs = 14,
    spread = 0.28,
    stalk = 0.14,
    pinnules = 10,
}: FrondOptions = {}) => {
    const rachis = [
        { x: 0, y: 0 },
        { x: 0, y: -length * 0.45 },
        { x: side * arch * length * 0.55, y: -length * 0.85 },
        { x: side * arch * length, y: -length * (1 - arch * 0.45) },
    ];
    const samples = Array.from({ length: 121 }, (_, i) =>
        cubic(rachis, i / 120),
    );
    const dirs = headings(samples);
    const sample = (u: number) => {
        const i = Math.round(clamp01(u) * 120);
        return { p: samples[i], tangent: dirs[i] };
    };

    const pinnae: FrondPinna[] = [];
    const maxPinna = length * spread;
    const position = (i: number) =>
        stalk + (0.96 - stalk) * (1 - Math.pow(1 - i / pairs, 1.3));

    for (let i = 0; i < pairs; i++) {
        const u = position(i);
        const gap = position(i + 1) - u;
        for (const s of [-1, 1] as const) {
            const uu = s === -1 ? u : u + gap * 0.4;
            const { p, tangent } = sample(uu);
            const v = (uu - stalk) / (1 - stalk);
            const reach = v < 0.22 ? 0.72 + 0.28 * (v / 0.22) : (1 - v) / 0.78;
            const pinnaLength = maxPinna * Math.max(reach, 0.03);
            const dir = turn(tangent, s * rad(lerp(80, 52, v)));
            pinnae.push({
                d: pinna(
                    p,
                    dir,
                    tangent,
                    pinnaLength,
                    pinnaLength > maxPinna * 0.14 ? pinnules : 0,
                ).join(""),
                base: p,
                tip: add(p, mul(dir, pinnaLength)),
            });
        }
    }
    const tip = sample(1);
    return {
        rachis: taper(samples, length * 0.016, length * 0.003),
        pinnae,
        tip: leaflet(tip.p, tip.tangent, length * 0.032, length * 0.012),
        // The far end of the rachis.
        end: tip.p,
    };
};

// The same frond as one path, for places where it never moves.
export const frondPath = (options: FrondOptions = {}) => {
    const { rachis, pinnae, tip } = frondParts(options);
    return rachis + pinnae.map((part) => part.d).join("") + tip;
};

// A ginkgo leaf: a fan with a notch in the middle of its outer edge, on a thin
// stalk, with veins fanning out from the stalk. The stalk's foot sits at
// (0, 0); `angle` turns the whole leaf about it, 0 pointing up the screen.
export const ginkgoParts = ({ radius = 120, angle = 0 } = {}) => {
    const up = turn({ x: 0, y: -1 }, rad(angle));
    const stalk = radius * 0.75;
    const base = mul(up, stalk);
    const spread = rad(66);
    const reach = (phi: number) =>
        radius *
        (1 - 0.3 * Math.exp(-Math.pow(phi / 0.06, 2))) *
        (1 + 0.02 * Math.sin(phi * 23));
    const along = (phi: number, r: number) => add(base, mul(turn(up, phi), r));

    const edge = Array.from({ length: 161 }, (_, i) => {
        const phi = lerp(-spread, spread, i / 160);
        return along(phi, reach(phi));
    });
    // The sides bow inward a little on their way down to the stalk.
    const side = (phi: number) =>
        Array.from({ length: 9 }, (_, i) => {
            const t = i / 8;
            return add(
                along(phi, reach(phi) * t),
                mul(
                    turn(up, phi + Math.sign(phi) * rad(90)),
                    -Math.sin(Math.PI * t) * radius * 0.05,
                ),
            );
        });
    const veins = Array.from({ length: 23 }, (_, k) => {
        const phi = lerp(-spread * 0.9, spread * 0.9, k / 22);
        return line([along(phi, radius * 0.08), along(phi, reach(phi) * 0.94)]);
    });
    return {
        stalk: taper(
            Array.from({ length: 13 }, (_, i) =>
                quadratic(
                    [
                        { x: 0, y: 0 },
                        add(
                            mul(up, stalk * 0.5),
                            mul(normal(up), radius * 0.08),
                        ),
                        base,
                    ],
                    i / 12,
                ),
            ),
            radius * 0.045,
            radius * 0.035,
        ),
        blade: polygon([...side(-spread), ...edge, ...side(spread).reverse()]),
        veins: veins.join(""),
        // Where the blade meets the stalk, and the middle of its outer edge.
        base,
        tip: along(0, reach(0)),
    };
};

export const ginkgoPaths = (
    options: { radius?: number; angle?: number } = {},
) => {
    const { stalk, blade, veins } = ginkgoParts(options);
    return { fill: stalk + blade, veins };
};

// A heart-shaped pothos leaf hanging from `base`, its tip along `dir`.
const heart = (base: Vec, dir: Vec, length: number, width: number) => {
    const n = normal(dir);
    const p = (x: number, y: number) =>
        add(base, add(mul(n, x * width), mul(dir, y * length)));
    return (
        `M${at(p(0, 0.08))}` +
        `C${at(p(0.12, -0.06))} ${at(p(0.5, -0.05))} ${at(p(0.5, 0.3))}` +
        `C${at(p(0.5, 0.62))} ${at(p(0.15, 0.85))} ${at(p(0, 1))}` +
        `C${at(p(-0.15, 0.85))} ${at(p(-0.5, 0.62))} ${at(p(-0.5, 0.3))}` +
        `C${at(p(-0.5, -0.05))} ${at(p(-0.12, -0.06))} ${at(p(0, 0.08))}Z`
    );
};

// A band along `points` that narrows from `from` to `to`, for drawing a stem
// again after it has moved.
export const taperPath = (points: Vec[], from: number, to: number) =>
    taper(points, from, to);

export type VineOptions = {
    length?: number;
    leaves?: number;
    // How far the stem wanders from straight down, at its end.
    sway?: number;
    phase?: number;
    leafSize?: number;
};

// The stem's width at its top and at its end.
export const VINE_STEM = { from: 2.6, to: 1.4 };

// A pothos vine hanging from (0, 0), in parts: the stem's centre line, and
// each leaf with the index of the stem point it hangs from. The stem sways a
// little more the lower it gets, and the leaves sit on alternate sides,
// shrinking toward the end.
export const vineParts = ({
    length = 220,
    leaves = 7,
    sway = 12,
    phase = 0,
    leafSize = 30,
}: VineOptions = {}) => {
    const steps = 48;
    const stem = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        return {
            x: sway * t * Math.sin(t * Math.PI * 1.6 + phase),
            y: t * length,
        };
    });
    const dirs = headings(stem);
    const parts: { d: string; at: number }[] = [];
    for (let k = 0; k < leaves; k++) {
        const share = k / (leaves - 1);
        const i = Math.round(lerp(0.14, 1, share) * steps);
        const size = leafSize * lerp(1, 0.6, share);
        if (k === leaves - 1) {
            parts.push({
                d: heart(stem[i], dirs[i], size, size * 0.8),
                at: i,
            });
            continue;
        }
        const side = k % 2 === 0 ? 1 : -1;
        const petiole = add(
            stem[i],
            mul(turn(dirs[i], side * rad(65)), size * 0.3),
        );
        parts.push({
            d:
                taper([stem[i], petiole], 1.6, 1.2) +
                heart(petiole, turn(dirs[i], side * rad(35)), size, size * 0.8),
            at: i,
        });
    }
    return { stem, leaves: parts };
};

// The same vine as one path, for places where it never moves.
export const vinePath = (options: VineOptions = {}) => {
    const { stem, leaves } = vineParts(options);
    return (
        taper(stem, VINE_STEM.from, VINE_STEM.to) +
        leaves.map((leaf) => leaf.d).join("")
    );
};

// A clump of stylised fronds growing from (0, 0): each a stem that arches and
// curls in at its tip, with short pinnae at an even spacing. Drawn as strokes
// with round caps; `width` is the stroke width for that frond.
export const fernClump = (
    fronds: { length: number; angle: number; curl: number }[],
) =>
    fronds.map(({ length, angle, curl }) => {
        const steps = 60;
        const points = [{ x: 0, y: 0 }];
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const heading = rad(
                angle + curl * (0.6 * t + 1.4 * Math.pow(t, 4)),
            );
            points.push(
                add(points[i - 1], {
                    x: (Math.cos(heading) * length) / steps,
                    y: (Math.sin(heading) * length) / steps,
                }),
            );
        }
        const dirs = headings(points);
        const pinnae: string[] = [];
        const count = 10;
        for (let k = 0; k < count; k++) {
            const t = lerp(0.18, 0.84, k / (count - 1));
            const i = Math.round(t * steps);
            const reach = length * 0.13 * Math.pow(1 - t, 0.6);
            for (const s of [-1, 1] as const) {
                const out = turn(dirs[i], s * rad(72));
                const end = add(
                    add(points[i], mul(out, reach)),
                    mul(dirs[i], reach * 0.3),
                );
                const bend = add(points[i], mul(out, reach * 0.6));
                pinnae.push(`M${at(points[i])}Q${at(bend)} ${at(end)}`);
            }
        }
        return {
            d: line(points) + pinnae.join(""),
            width: length * 0.02,
            tip: points[steps],
        };
    });

// A greenhouse front: a row of arched bays between piers, each with an inner
// arch, a fan of glazing bars, a transom, and a centre mullion, under a beam
// that carries a run of circles and squares. One stroked path, drawn in a box
// `width` by `height` from (0, 0). Every pier carries a square, so a single bay
// repeats as a tile: the half squares at its two edges join up.
export const greenhousePath = ({
    width = 1152,
    height = 416,
    bays = 5,
} = {}) => {
    const bay = width / bays;
    const margin = bay * 0.14;
    const radius = bay / 2 - margin;
    const beam = { top: 18, bottom: 42 };
    const spring = beam.bottom + 36 + radius;
    const parts = [`M0 ${beam.top}H${width}M0 ${beam.bottom}H${width}`];
    for (let i = 0; i <= bays; i++) {
        const x = i * bay;
        const mid = (beam.top + beam.bottom) / 2;
        parts.push(
            `M${fmt(x)} ${beam.bottom}V${height}`,
            `M${fmt(x - 4)} ${mid - 4}h8v8h-8Z`,
        );
        if (i < bays) {
            const cx = x + bay / 2;
            parts.push(
                `M${fmt(cx + 5)} ${mid}A5 5 0 1 0 ${fmt(cx - 5)} ${mid}A5 5 0 1 0 ${fmt(cx + 5)} ${mid}`,
            );
            const left = x + margin;
            const right = x + bay - margin;
            const inner = radius - 10;
            parts.push(
                `M${fmt(left)} ${height}V${fmt(spring)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(right)} ${fmt(spring)}V${height}`,
                `M${fmt(left + 10)} ${height}V${fmt(spring)}A${fmt(inner)} ${fmt(inner)} 0 0 1 ${fmt(right - 10)} ${fmt(spring)}V${height}`,
                `M${fmt(left + 10)} ${fmt(spring)}H${fmt(right - 10)}`,
                `M${fmt(cx)} ${fmt(spring)}V${height}`,
            );
            const hub = radius * 0.22;
            parts.push(
                `M${fmt(cx - hub)} ${fmt(spring)}A${fmt(hub)} ${fmt(hub)} 0 0 1 ${fmt(cx + hub)} ${fmt(spring)}`,
            );
            for (const deg of [-45, -90, -135]) {
                const a = rad(deg);
                parts.push(
                    `M${at({ x: cx + Math.cos(a) * hub, y: spring + Math.sin(a) * hub })}L${at({ x: cx + Math.cos(a) * inner, y: spring + Math.sin(a) * inner })}`,
                );
            }
        }
    }
    return parts.join("");
};

// A pointed lens from `base` along `dir`: one lobe of an ivy leaf.
const lobe = (base: Vec, dir: Vec, length: number, width: number) => {
    const n = normal(dir);
    const mid = add(base, mul(dir, length * 0.45));
    const tip = add(base, mul(dir, length));
    return (
        `M${at(base)}Q${at(add(mid, mul(n, width)))} ${at(tip)}` +
        `Q${at(add(mid, mul(n, -width)))} ${at(base)}Z`
    );
};

const IVY_LOBES = [
    [0, 1, 0.58],
    [-50, 0.72, 0.5],
    [50, 0.72, 0.5],
    [-105, 0.45, 0.38],
    [105, 0.45, 0.38],
];

// A three-lobed ivy leaf with two small lobes at its base, and a vein out to
// the tip of each lobe.
const ivyLeaf = (base: Vec, dir: Vec, size: number) => ({
    fill: IVY_LOBES.map(([deg, length, width]) =>
        lobe(base, turn(dir, rad(deg)), size * length, size * width),
    ).join(""),
    veins: IVY_LOBES.map(([deg, length]) =>
        line([base, add(base, mul(turn(dir, rad(deg)), size * length * 0.78))]),
    ).join(""),
});

// A smooth curve through `points`, sampled `perSegment` times between each
// pair (a Catmull-Rom spline, which passes through every point it is given).
const throughPoints = (points: Vec[], perSegment: number) => {
    const out: Vec[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(i + 2, points.length - 1)];
        for (let k = 0; k < perSegment; k++) {
            const t = k / perSegment;
            const blend = (a: number, b: number, c: number, d: number) =>
                0.5 *
                (2 * b +
                    (c - a) * t +
                    (2 * a - 5 * b + 4 * c - d) * t * t +
                    (3 * b - a - 3 * c + d) * t * t * t);
            out.push({
                x: blend(p0.x, p1.x, p2.x, p3.x),
                y: blend(p0.y, p1.y, p2.y, p3.y),
            });
        }
    }
    out.push(points[points.length - 1]);
    return out;
};

// Ivy on a panel. (0, 0) is the panel's top-right corner, and the panel's 1px
// border runs from x -1 to 0 and y 0 to 1. With a `rise`, the stem climbs the
// panel's right side from the section floor; with none, it reaches in from
// beyond the panel's right edge. Either way it then creeps left along the top
// edge in small uneven waves, lifting a few pixels off and settling back, and
// touches the border at the corner, once along the top, and at its tip. With
// `overhang`, a few leaves and one thin strand hang down over the top edge.
// One leaf of the ivy, or its hanging strand with the leaves on it: the
// filled shape, the veins drawn over it, the point it turns about, and the
// far end it reaches.
export type IvyPart = { fill: string; veins: string; pivot: Vec; end: Vec };

export const ivyCornerParts = ({
    rise = 340,
    run = 240,
    leafSize = 30,
    overhang = true,
    seed = 4,
} = {}) => {
    const random = seeded(seed);
    const perSegment = 8;
    const side =
        rise > 0
            ? [8, 3, 7, 4, 9, 5, 6, 3].map((x, i, all) => ({
                  x,
                  y: lerp(rise, 22, i / (all.length - 1)),
              }))
            : [
                  { x: 44, y: -7 },
                  { x: 20, y: -3 },
                  { x: 7, y: 1 },
              ];
    const top = [
        [0.08, -3.5],
        [0.18, -1.5],
        [0.28, -5],
        [0.38, 0.5],
        [0.49, -4],
        [0.61, -6.5],
        [0.72, -2.5],
        [0.83, -4.5],
        [0.93, -1],
        [1, 0.5],
    ].map(([t, y]) => ({ x: -run * t, y }));
    const stem = throughPoints(
        [...side, { x: -0.5, y: 0.5 }, ...top],
        perSegment,
    );
    const dirs = headings(stem);
    const corner = side.length * perSegment;
    const last = stem.length - 1;
    // Leaf positions as a share of the side run or of the top run.
    const onSide = (share: number) => Math.round(share * corner);
    const onTop = (share: number) =>
        corner + Math.round(share * (last - corner));
    const leafParts: IvyPart[] = [];
    const makeLeaf = (at: Vec, dir: Vec, out: Vec, size: number): IvyPart => {
        const petiole = add(at, mul(out, size * 0.3));
        const facing = turn(
            unit(add(out, mul(dir, 0.35))),
            rad((random() - 0.5) * 30),
        );
        const leaf = ivyLeaf(petiole, facing, size);
        return {
            fill: taper([at, petiole], 1.6, 1.1) + leaf.fill,
            veins: leaf.veins,
            pivot: at,
            end: add(petiole, mul(facing, size)),
        };
    };

    // Each leaf faces away from the panel (1) or over it (-1). The side run
    // keeps its leaves off the panel, clear of the panel's own labels.
    const leaves = [
        ...(rise > 0 ? [0.08, 0.3, 0.52, 0.74, 0.95] : [0.6]).map((share) => [
            onSide(share),
            1,
        ]),
        [onTop(0.02), overhang ? -1 : 1],
        ...[
            [0.14, 1],
            [0.3, 1],
            [0.45, overhang ? -1 : 1],
            [0.6, 1],
            [0.76, 1],
            [0.92, 1],
        ].map(([share, facing]) => [onTop(share), facing]),
    ];
    for (const [i, facing] of leaves) {
        leafParts.push(
            makeLeaf(
                stem[i],
                dirs[i],
                mul(normal(dirs[i]), facing),
                leafSize * lerp(1, 0.6, i / last) * (0.85 + random() * 0.3),
            ),
        );
    }

    let strandPart: IvyPart | null = null;

    if (overhang) {
        // A strand that has slipped over the edge and hangs in front of the
        // panel.
        const from = stem[onTop(0.38)];
        const strand = throughPoints(
            [
                from,
                { x: from.x + 3, y: 16 },
                { x: from.x - 3, y: 32 },
                { x: from.x + 1, y: 46 },
            ],
            6,
        );
        const strandDirs = headings(strand);
        const mid = Math.round(strand.length * 0.45);
        const end = strand.length - 1;
        const strandLeaves = [
            makeLeaf(
                strand[mid],
                strandDirs[mid],
                normal(strandDirs[mid]),
                leafSize * 0.5,
            ),
            makeLeaf(
                strand[end],
                strandDirs[end],
                strandDirs[end],
                leafSize * 0.45,
            ),
        ];
        strandPart = {
            fill:
                taper(strand, 1.6, 0.9) +
                strandLeaves.map((leaf) => leaf.fill).join(""),
            veins: strandLeaves.map((leaf) => leaf.veins).join(""),
            pivot: from,
            end: strand[end],
        };
    }

    return {
        stem: taper(stem, 2.6, 1.2),
        leaves: leafParts,
        strand: strandPart,
    };
};

export const ivyCornerPaths = (
    options: Parameters<typeof ivyCornerParts>[0] = {},
) => {
    const { stem, leaves, strand } = ivyCornerParts(options);
    const parts = strand ? [...leaves, strand] : leaves;
    return {
        fill: stem + parts.map((part) => part.fill).join(""),
        veins: parts.map((part) => part.veins).join(""),
    };
};

// A monstera leaf on a long stalk. The stalk starts at (0, 0) and runs along
// `dir` into the leaf. The blade is built from fingers that leave the midrib
// side by side and curve toward the tip, so the splits between them open up
// toward the edge. `veins` is the midrib, to be drawn in the background colour.
export const monsteraParts = ({
    length = 260,
    stalk = 140,
    dir = { x: -1, y: -0.1 },
    fingers = 7,
} = {}) => {
    const along = unit(dir);
    const base = mul(along, stalk);
    const axis = unit(turn(along, rad(-35)));
    const n = normal(axis);
    const halfWidth = (t: number) =>
        length * 0.44 * Math.pow(Math.sin(Math.PI * lerp(0.14, 1, t)), 0.7);
    const midrib = (t: number) =>
        add(
            base,
            add(
                mul(axis, t * length),
                mul(n, Math.sin(Math.PI * t) * length * 0.04),
            ),
        );
    const point = (t: number, x: number) => add(midrib(t), mul(n, x));

    const fill = [
        taper(
            Array.from({ length: 13 }, (_, i) =>
                quadratic(
                    [
                        { x: 0, y: 0 },
                        add(mul(along, stalk * 0.5), mul(n, -stalk * 0.08)),
                        midrib(0.08),
                    ],
                    i / 12,
                ),
            ),
            length * 0.045,
            length * 0.03,
        ),
    ];
    const steps = Array.from({ length: 33 }, (_, i) => i / 32);
    const coreHalf = (t: number) => halfWidth(t) * 0.34 + length * 0.012;
    fill.push(
        polygon([
            ...steps.map((t) => point(t * 0.9, coreHalf(t * 0.9))),
            ...steps
                .slice()
                .reverse()
                .map((t) => point(t * 0.9, -coreHalf(t * 0.9))),
        ]),
    );

    const gap = (0.82 / (fingers - 1)) * length;
    for (const side of [-1, 1]) {
        for (let k = 0; k < fingers; k++) {
            const s = k / (fingers - 1);
            const t = lerp(0.04, 0.86, s);
            const angle = rad(lerp(112, 38, s));
            const reach = halfWidth(t) * lerp(1, 1.25, s);
            const root = point(t, side * coreHalf(t) * 0.8);
            const curve = [
                root,
                add(
                    root,
                    mul(turn(axis, side * (angle + rad(14))), reach * 0.55),
                ),
                add(root, mul(turn(axis, side * angle), reach)),
            ];
            const samples = Array.from({ length: 13 }, (_, i) =>
                quadratic(curve, i / 12),
            );
            const rootWidth = gap * Math.sin(angle) * 1.05;
            const endWidth = gap * lerp(1.35, 0.95, s);
            const { left, right } = band(samples, (i) => {
                const w = lerp(rootWidth, endWidth, i / 12) / 2;
                return [w, w];
            });
            fill.push(polygon([...left, ...right.reverse()]));
            fill.push(circle(samples[12], endWidth / 2));
        }
    }
    fill.push(leaflet(midrib(0.86), axis, length * 0.2, length * 0.1));

    const veins = line(
        Array.from({ length: 12 }, (_, i) => midrib(0.06 + (i / 11) * 0.84)),
    );
    const [stalkPath, ...blade] = fill;
    return {
        stalk: stalkPath,
        blade: blade.join(""),
        veins,
        // Where the blade meets the stalk, and the blade's tip.
        base: midrib(0),
        tip: midrib(1),
    };
};

export const monsteraPaths = (
    options: Parameters<typeof monsteraParts>[0] = {},
) => {
    const { stalk, blade, veins } = monsteraParts(options);
    return { fill: stalk + blade, veins };
};

// Tree rings: uneven, slightly wobbly rings around a pith that sits off
// centre, the way a trunk grows more on one side. Innermost ring first, each
// with its path and the circle it wobbles about.
export const treeRings = ({ rings = 12, radius = 200, seed = 5 } = {}) => {
    const random = seeded(seed);
    const widths = Array.from({ length: rings }, () => 0.5 + random());
    const total = widths.reduce((sum, w) => sum + w, 0);
    let r = 0;
    return widths.map((w) => {
        r += (w / total) * radius;
        const shift = { x: r * 0.1, y: -r * 0.06 };
        const phase = random() * 6;
        return {
            d: polygon(
                Array.from({ length: 96 }, (_, i) => {
                    const t = (i / 96) * Math.PI * 2;
                    const rr =
                        r *
                        (1 +
                            0.03 * Math.sin(3 * t + phase) +
                            0.015 * Math.cos(5 * t + phase * 1.3));
                    return add(shift, {
                        x: rr * Math.cos(t),
                        y: rr * Math.sin(t),
                    });
                }),
            ),
            radius: r,
            centre: shift,
        };
    });
};

export const treeRingPaths = (options: Parameters<typeof treeRings>[0] = {}) =>
    treeRings(options).map((ring) => ring.d);

// A viewBox that fits a path from this module, read off its coordinates. Bezier
// control points sit outside the curve, so the box errs a little large.
export const viewBoxOf = (d: string, pad = 0) => {
    const values = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs = values.filter((_, i) => i % 2 === 0);
    const ys = values.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const width = Math.max(...xs) + pad - minX;
    const height = Math.max(...ys) + pad - minY;
    return [minX, minY, width, height].map(Math.round).join(" ");
};
