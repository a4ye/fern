import { geoMercator, type GeoProjection } from "d3-geo";
import type { Position } from "geojson";

// Two steps of detail between the coarse outlines and the ground. Natural Earth
// at 1:50m draws a country you would recognise; 1:10m draws a coastline worth
// looking at from a city. Each is cut along its own grid, coarser data into
// bigger cells, because a wider view needs fewer of them to fill the panel.
//
// `from` is the zoom the level takes over at. Below the first, the coarse
// outlines bundled with the panel read perfectly well and fetching anything
// would mean most of a continent's worth of cells.
export type DetailLevel = {
    name: string;
    source: string;
    // Natural Earth's country shapes hold no inland water at all, so a lake is
    // drawn as land unless the lakes are laid over it. It shows: without them
    // Lake Ontario is a field, while Erie half appears through the gap the
    // border between two countries happens to leave down the middle of it.
    lakes: string;
    // Provinces and states. A country outline alone leaves nothing between the
    // coast and the border, and people think of where they applied by state.
    borders: string;
    degrees: number;
    from: number;
};

export const DETAIL_LEVELS: readonly DetailLevel[] = [
    {
        name: "50m",
        source: "world-atlas/countries-50m.json",
        lakes: "ne_50m_lakes",
        borders: "ne_50m_admin_1_states_provinces_lines",
        degrees: 15,
        from: 16,
    },
    {
        name: "10m",
        source: "world-atlas/countries-10m.json",
        lakes: "ne_10m_lakes",
        borders: "ne_10m_admin_1_states_provinces_lines",
        // Half the width of the coarser grid. Ten degrees of the busiest
        // ground ran to several hundred kilobytes once borders joined the
        // coastline, and a quarter of the area is a quarter of the download.
        degrees: 5,
        from: 64,
    },
];

// Neighbouring cells are cut to overlap by this much. Two shapes that merely
// touch leave a hairline of background showing between them wherever the
// renderer antialiases their shared edge, which draws a grid over the map. A
// hundredth of a degree is about a kilometre, some eighteen pixels at the
// deepest zoom, and costs a fraction of a percent in size.
export const DETAIL_CELL_OVERLAP = 0.02;

// A view should not touch off a dozen requests. Past this the panel is better
// served by whatever it is already drawing. Nine covers a three by three grid,
// which is what the finest level needs at the zoom it takes over.
const MAX_CELLS = 9;

// The finest level the zoom has reached, or nothing while the panel is still
// showing enough ground that the coarse outlines do.
export const detailLevelFor = (scale: number): DetailLevel | null =>
    [...DETAIL_LEVELS].reverse().find((level) => scale >= level.from) ?? null;

export const detailCellKey = (west: number, south: number): string =>
    `${west}_${south}`;

export type DetailView = { level: DetailLevel; keys: string[] } | null;

// The cells a level's grid covers the panel with. The corners are read back
// through the projection into longitude and latitude, which is what the grids
// are cut along.
const keysForLevel = (
    projection: GeoProjection,
    width: number,
    height: number,
    level: DetailLevel,
): string[] | null => {
    if (!projection.invert) return null;

    const corners = [
        projection.invert([0, 0]),
        projection.invert([width, 0]),
        projection.invert([0, height]),
        projection.invert([width, height]),
    ].filter((corner) => corner !== null);
    if (corners.length < 4) return null;

    const floorTo = (value: number) =>
        Math.floor(value / level.degrees) * level.degrees;
    const longitudes = corners.map(([longitude]) => longitude);
    const latitudes = corners.map(([, latitude]) => latitude);
    const west = floorTo(Math.max(-180, Math.min(...longitudes)));
    const east = floorTo(Math.min(180, Math.max(...longitudes)));
    const south = floorTo(Math.max(-90, Math.min(...latitudes)));
    const north = floorTo(Math.min(90, Math.max(...latitudes)));

    const keys: string[] = [];
    for (let x = west; x <= east; x += level.degrees) {
        for (let y = south; y <= north; y += level.degrees) {
            keys.push(detailCellKey(x, y));
            if (keys.length > MAX_CELLS) return null;
        }
    }
    return keys;
};

// The finest level this zoom deserves, which is what to go and fetch.
export const detailCellsFor = (
    projection: GeoProjection,
    width: number,
    height: number,
    scale: number,
): DetailView => {
    const level = detailLevelFor(scale);
    if (!level) return null;

    const keys = keysForLevel(projection, width, height, level);
    return keys ? { level, keys } : null;
};

// The finest level already in hand, which is what to draw. While a closer level
// is still arriving, the one behind it is usually cached from a moment ago, and
// holding onto that beats dropping back to the outlines bundled with the panel
// and then jumping forward again.
export const readyDetailFor = (
    projection: GeoProjection,
    width: number,
    height: number,
    scale: number,
    inHand: (level: DetailLevel, key: string) => boolean,
): DetailView => {
    for (const level of [...DETAIL_LEVELS].reverse()) {
        if (scale < level.from) continue;

        const keys = keysForLevel(projection, width, height, level);
        if (keys?.every((key) => inHand(level, key))) return { level, keys };
    }
    return null;
};

export type CellShapes = {
    land: Position[][][];
    water: Position[][][];
    // Lines rather than outlines: a border is drawn along, not around, so it is
    // never closed back on itself.
    borders: Position[][];
};

// Panning and zooming a Mercator leaves its points where they were, scaled and
// shifted: every view of one is this view times a scale plus an offset. So a
// cell is projected once, when it arrives, and a frame only multiplies and adds.
// Projecting each point again for each frame spent a logarithm and two array
// allocations a point, and was near half the work of a pan.
const BASE = geoMercator().scale(1).translate([0, 0]);

// A ring of coastline, border or lake shore, in base coordinates. The points
// are laid end to end rather than paired, so drawing walks one array instead of
// one object per point, and the box around them is carried along so a ring that
// misses the panel can be dropped without reading it.
export type Ring = {
    points: Float64Array;
    left: number;
    right: number;
    top: number;
    bottom: number;
};

export const ringFrom = (points: readonly Position[]): Ring => {
    const held = new Float64Array(points.length * 2);
    let size = 0;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;

    for (const [x, y] of points) {
        // The poles project to infinity, and a point that lands nowhere cannot
        // be drawn to.
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        held[size] = x;
        held[size + 1] = y;
        size += 2;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
    }
    return { points: held.subarray(0, size), left, right, top, bottom };
};

const baseRing = (ring: readonly Position[]): Ring =>
    ringFrom(
        ring.flatMap((point) => {
            const at = BASE([point[0], point[1]]);
            return at ? [at as Position] : [];
        }),
    );

export type DetailCell = {
    key: string;
    land: Ring[];
    water: Ring[];
    borders: Ring[];
    edges: Ring[];
};

// Where the base coordinates land, and the panel they land on.
export type Placement = {
    scale: number;
    x: number;
    y: number;
    width: number;
    height: number;
};

export const placementFor = (
    projection: GeoProjection,
    width: number,
    height: number,
): Placement => {
    const [x, y] = projection.translate();
    return { scale: projection.scale(), x, y, width, height };
};

// A stroke reaches half its width past the line it follows, so a ring just
// outside the panel can still show inside it. Two pixels clears the widest
// stroke the map draws.
const PANEL_EDGE = 2;

// Cells are cut to a grid, not to the panel, so most of one is off screen as
// soon as the map is zoomed in: at the deepest zoom about a sixth of the points
// a cell holds are in view. A ring outside the panel draws nothing. A ring that
// surrounds the panel has a box over the panel, so it is kept, and dropping the
// rest leaves both the fills and the lines exactly as they were.
const offPanel = (ring: Ring, at: Placement): boolean =>
    ring.right * at.scale + at.x < -PANEL_EDGE ||
    ring.left * at.scale + at.x > at.width + PANEL_EDGE ||
    ring.bottom * at.scale + at.y < -PANEL_EDGE ||
    ring.top * at.scale + at.y > at.height + PANEL_EDGE;

// Drawn by placing the points and joining them, rather than by handing the
// shapes to d3's path builder. d3 reads a ring's direction to decide which side
// of it is inside, on the reasoning that a ring on a globe has land on one side
// and the rest of the world on the other. Cutting the world into cells leaves
// rings wound whichever way the cut happened to produce, so d3 turns ground the
// panel sits inside into open sea. These cells are small and already limited to
// what is on screen, so none of that machinery is needed: the points go
// straight down, and the fill rule sorts out the rest.
// A placed coordinate is a double, and printing one in full spends some thirty
// characters to place a point inside a ten-thousandth of a pixel. The panel is
// redrawn on every frame of a pan, so that text is rebuilt, handed to the
// browser and parsed again each time. A tenth of a pixel is already half a
// device pixel on the densest screen, and it costs a quarter of the characters.
const PLACES = 10;

const pathOf = (
    rings: readonly Ring[],
    at: Placement,
    close: boolean,
): string => {
    let path = "";
    for (const ring of rings) {
        if (offPanel(ring, at)) continue;

        const { points } = ring;
        let lastX = NaN;
        let lastY = NaN;
        let started = false;
        for (let step = 0; step < points.length; step += 2) {
            const x =
                Math.round((points[step] * at.scale + at.x) * PLACES) / PLACES;
            const y =
                Math.round((points[step + 1] * at.scale + at.y) * PLACES) /
                PLACES;
            // Points closer together than that land on the same coordinate, and
            // a line to where the pen already is draws nothing.
            if (started && x === lastX && y === lastY) continue;

            path += `${started ? "L" : "M"}${x},${y}`;
            lastX = x;
            lastY = y;
            started = true;
        }
        if (started && close) path += "Z";
    }
    return path;
};

export const detailFillPath = (
    cells: readonly DetailCell[],
    at: Placement,
): string =>
    pathOf(
        cells.flatMap((cell) => cell.land),
        at,
        true,
    );

// Lakes are painted over the land rather than cut out of it, which keeps the
// two sets of shapes independent and spares the build a polygon subtraction.
export const detailWaterPath = (
    cells: readonly DetailCell[],
    at: Placement,
): string =>
    pathOf(
        cells.flatMap((cell) => cell.water),
        at,
        true,
    );

// Borders arrive already cut to the cell, and a cut end is a real end rather
// than a side the clip closed along, so they need no trimming.
export const detailBorderPath = (
    cells: readonly DetailCell[],
    at: Placement,
): string =>
    pathOf(
        cells.flatMap((cell) => cell.borders),
        at,
        false,
    );

// The sides the cell was actually cut along, overlap included, so the edges
// that closed the shape are recognised and left out of the coastline.
export const boundsOf = (key: string, degrees: number) => {
    const [west, south] = key.split("_").map(Number);
    return {
        west: west - DETAIL_CELL_OVERLAP,
        south: south - DETAIL_CELL_OVERLAP,
        east: west + degrees + DETAIL_CELL_OVERLAP,
        north: south + degrees + DETAIL_CELL_OVERLAP,
    };
};

type Bounds = ReturnType<typeof boundsOf>;

// A cell's shape is closed along the cell's own sides, which are not coastline.
// Stroking them draws a line down the middle of the sea wherever two cells meet,
// so the outline is taken from the shape with those sides left out.
const cutAlongCell = (
    [ax, ay]: Position,
    [bx, by]: Position,
    bounds: Bounds,
): boolean =>
    (ax === bx && (ax === bounds.west || ax === bounds.east)) ||
    (ay === by && (ay === bounds.south || ay === bounds.north));

const edgesOfRing = (ring: Position[], bounds: Bounds): Position[][] => {
    const segments = ring.map(
        (point, at) => [point, ring[(at + 1) % ring.length]] as const,
    );
    const first = segments.findIndex(([a, b]) => cutAlongCell(a, b, bounds));
    if (first === -1) return [[...ring, ring[0]]];

    const lines: Position[][] = [];
    let run: Position[] = [];
    for (let step = 0; step < segments.length; step += 1) {
        const [a, b] = segments[(first + step) % segments.length];
        if (cutAlongCell(a, b, bounds)) {
            if (run.length >= 2) lines.push(run);
            run = [];
            continue;
        }
        if (run.length === 0) run.push(a);
        run.push(b);
    }
    if (run.length >= 2) lines.push(run);
    return lines;
};

// A lake shore is an outline just as a coastline is, so both are drawn.
export const detailEdges = (shapes: CellShapes, bounds: Bounds): Position[][] =>
    [...shapes.land, ...shapes.water].flatMap((rings) =>
        rings.flatMap((ring) => edgesOfRing(ring, bounds)),
    );

export const detailEdgePath = (
    cells: readonly DetailCell[],
    at: Placement,
): string =>
    pathOf(
        cells.flatMap((cell) => cell.edges),
        at,
        false,
    );

// Everything a cell will ever need to be drawn, worked out the once. Which
// sides of a shape are coastline and which are the cut the cell was made along
// does not change with the view, but it was worked out again on every frame of
// a pan, pairing up every point of every ring to do it.
export const cellFrom = (
    key: string,
    degrees: number,
    shapes: CellShapes,
): DetailCell => ({
    key,
    land: shapes.land.flat().map(baseRing),
    water: shapes.water.flat().map(baseRing),
    borders: shapes.borders.map(baseRing),
    edges: detailEdges(shapes, boundsOf(key, degrees)).map(baseRing),
});

// Cells never change once built, so one fetch each lasts the life of the tab.
// The cache is shared rather than per component: opening insights on a second
// list should not download the same coastline again. Keys carry their level,
// since the same square of ground exists at more than one.
const loaded = new Map<string, DetailCell>();
const loading = new Map<string, Promise<void>>();

const cellPath = (level: DetailLevel, key: string): string =>
    `${level.name}/${key}`;

export const loadedCell = (
    level: DetailLevel,
    key: string,
): DetailCell | undefined => loaded.get(cellPath(level, key));

export const loadedCellKeys = (): ReadonlySet<string> => new Set(loaded.keys());

export const isCellLoaded = (
    ready: ReadonlySet<string>,
    level: DetailLevel,
    key: string,
): boolean => ready.has(cellPath(level, key));

// Every position on the grid was built, open sea included, so a cell that does
// not answer is a fault rather than empty ground. It is left unrecorded, which
// holds the level back and keeps the coarser outlines on screen, instead of
// remembering a failed request as bare ground for as long as the tab lives.
export const loadDetailCells = async (
    level: DetailLevel,
    keys: readonly string[],
): Promise<boolean> => {
    for (const key of keys) {
        const at = cellPath(level, key);
        if (loaded.has(at) || loading.has(at)) continue;

        const request = fetch(`/map-detail/${at}.json`)
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        `Map detail cell ${at} returned ${response.status}.`,
                    );
                }
                loaded.set(
                    at,
                    cellFrom(
                        key,
                        level.degrees,
                        (await response.json()) as CellShapes,
                    ),
                );
            })
            .finally(() => loading.delete(at));
        loading.set(at, request);
    }

    const pending = keys
        .map((key) => loading.get(cellPath(level, key)))
        .filter((request): request is Promise<void> => request !== undefined);
    if (pending.length === 0) return false;

    await Promise.allSettled(pending);
    return true;
};
