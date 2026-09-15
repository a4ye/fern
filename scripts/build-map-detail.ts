import { geoIdentity, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { Feature, Geometry, Position } from "geojson";
import {
    boundsOf,
    detailCellKey,
    DETAIL_LEVELS,
    type CellShapes,
    type DetailLevel,
} from "../src/components/dashboard/location-map-detail";
import {
    MAX_SCALE,
    projectionFor,
} from "../src/components/dashboard/location-map-data";

// Natural Earth's detailed sets are far too large to send whole, and far too
// large to reproject on every frame: the 1:10m countries alone hold half a
// million points, and the borders beside them are 20 MB. Cut into cells, each
// level is only ever asked for the piece on screen, which around San Francisco
// is a couple of tens of kilobytes.
const OUTPUT = new URL("../public/map-detail/", import.meta.url);

// Only the countries are on npm. The rest are fetched once and kept, because
// rebuilding on every install must not need the network.
const NATURAL_EARTH =
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const CACHE = new URL("../.cache/natural-earth/", import.meta.url);

type Ring = Position[];
type Bounds = { west: number; south: number; east: number; north: number };

// A shape with the ground it covers worked out once. Clipping every shape
// against every cell would be millions of calls, nearly all of them on shapes
// nowhere near the cell; comparing two boxes first throws those out at once.
type Shape = { geometry: Geometry; bounds: Bounds };

// The source carries fourteen decimal places, which is a fraction of a
// millimetre. At the deepest zoom the panel allows, one pixel covers about 60
// metres of ground, so five places is still some fifty times finer than
// anything that can be drawn, and it takes the whole set from 21 MB to a size
// worth building. Rounding folds neighbouring points together, and a repeated
// point draws nothing, so they go.
const PLACES = 1e5;

// Ramer-Douglas-Peucker: drop any point that sits within `tolerance` of the
// line between the points either side of it, since it cannot move a pixel.
const simplify = (points: Ring, tolerance: number): Ring => {
    if (points.length < 3) return points;

    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;

    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length > 0) {
        const range = stack.pop();
        if (!range) break;
        const [first, last] = range;
        if (last <= first + 1) continue;

        const [ax, ay] = points[first];
        const [bx, by] = points[last];
        const dx = bx - ax;
        const dy = by - ay;
        const span = Math.hypot(dx, dy);

        let worst = 0;
        let at = first;
        for (let index = first + 1; index < last; index += 1) {
            const [px, py] = points[index];
            const away =
                span === 0
                    ? Math.hypot(px - ax, py - ay)
                    : Math.abs(dx * (ay - py) - (ax - px) * dy) / span;
            if (away > worst) {
                worst = away;
                at = index;
            }
        }

        if (worst <= tolerance) continue;
        keep[at] = 1;
        stack.push([first, at], [at, last]);
    }

    return points.filter((_, index) => keep[index] === 1);
};

// Records what d3 walks out instead of turning it into an SVG string, which is
// the only way to get the clipped shape back as coordinates. A run that d3
// closes is an outline; one it leaves open is a border.
const shapeRecorder = () => {
    const closed: Ring[] = [];
    const open: Ring[] = [];
    let run: Ring = [];

    const add = (x: number, y: number) => {
        const point: Position = [
            Math.round(x * PLACES) / PLACES,
            Math.round(y * PLACES) / PLACES,
        ];
        const last = run[run.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) return;
        run.push(point);
    };

    const endOpen = () => {
        if (run.length >= 2) open.push(run);
        run = [];
    };

    return {
        closed,
        open,
        endOpen,
        context: {
            beginPath() {
                closed.length = 0;
                open.length = 0;
                run = [];
            },
            moveTo(x: number, y: number) {
                endOpen();
                add(x, y);
            },
            lineTo(x: number, y: number) {
                add(x, y);
            },
            closePath() {
                if (run.length >= 3) closed.push(run);
                run = [];
            },
            arc() {},
        },
    };
};

// d3's own rectangle clipper. Hand-rolling one with Sutherland-Hodgman looked
// simpler and was wrong: it assumes the shape crosses the rectangle once, so a
// coastline that weaves in and out of a cell came back stitched together by
// diagonals straight across the cell. This walks the boundary properly, and it
// also fills a cell that sits wholly inland, which has no edge to clip at all.
const clipTo = (bounds: Bounds, geometry: Geometry, tolerance: number) => {
    const recorder = shapeRecorder();
    const clipped = geoIdentity().clipExtent([
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
    ]);
    geoPath(clipped, recorder.context)(geometry);
    recorder.endOpen();

    // An outline needs three points to enclose anything, a line two.
    const thinned = (parts: Ring[], least: number) =>
        parts
            .map((part) => simplify(part, tolerance))
            .filter((part) => part.length >= least);

    return {
        closed: thinned(recorder.closed, 3),
        open: thinned(recorder.open, 2),
    };
};

const overlaps = (a: Bounds, b: Bounds): boolean =>
    a.west <= b.east &&
    a.east >= b.west &&
    a.south <= b.north &&
    a.north >= b.south;

const boundsAround = (coordinates: Position[]): Bounds => {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const [x, y] of coordinates) {
        if (x < west) west = x;
        if (x > east) east = x;
        if (y < south) south = y;
        if (y > north) north = y;
    }
    return { west, east, south, north };
};

// Split into single shapes so each carries its own box. A country held as one
// multi-part shape would otherwise stretch from Alaska to Florida and be
// clipped against every cell in between.
const shapesOf = (geometry: Geometry | null): Shape[] => {
    // Natural Earth carries the odd feature with no geometry at all.
    if (!geometry) return [];

    const single = (parts: Position[][], type: "Polygon" | "LineString") =>
        type === "Polygon"
            ? {
                  geometry: { type, coordinates: parts } as Geometry,
                  bounds: boundsAround(parts.flat()),
              }
            : {
                  geometry: { type, coordinates: parts[0] } as Geometry,
                  bounds: boundsAround(parts[0]),
              };

    if (geometry.type === "Polygon")
        return [single(geometry.coordinates, "Polygon")];
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.map((rings) => single(rings, "Polygon"));
    }
    if (geometry.type === "LineString") {
        return [single([geometry.coordinates], "LineString")];
    }
    if (geometry.type === "MultiLineString") {
        return geometry.coordinates.map((line) => single([line], "LineString"));
    }
    return [];
};

type Collection = { features: Feature[] };

// Parsed before it is kept, so a download cut short cannot leave a broken file
// behind to be trusted by every build after it.
const fetchLayer = async (name: string): Promise<Collection> => {
    const response = await fetch(`${NATURAL_EARTH}/${name}.geojson`);
    if (!response.ok) {
        throw new Error(`Natural Earth ${name} returned ${response.status}.`);
    }

    const body = await response.text();
    let layer: Collection;
    try {
        layer = JSON.parse(body) as Collection;
    } catch {
        throw new Error(
            `Natural Earth ${name} arrived incomplete: ${body.length} bytes that do not parse.`,
        );
    }
    if (!Array.isArray(layer.features)) {
        throw new Error(`Natural Earth ${name} holds no features.`);
    }

    await Bun.write(new URL(`${name}.geojson`, CACHE), body);
    return layer;
};

const layerFor = async (name: string): Promise<Shape[]> => {
    const held = Bun.file(new URL(`${name}.geojson`, CACHE));
    const layer = (await held.exists())
        ? ((await held.json()) as Collection)
        : await fetchLayer(name);
    return layer.features.flatMap((entry) => shapesOf(entry.geometry));
};

const countriesFor = async (source: string): Promise<Shape[]> => {
    const topology = (await Bun.file(
        Bun.resolveSync(source, process.cwd()),
    ).json()) as Topology;
    const land = feature(topology, topology.objects.countries) as unknown as {
        features: Feature[];
    };
    return land.features.flatMap((entry) => shapesOf(entry.geometry));
};

// How wide the whole world is drawn, in pixels, before any zoom. Taken from the
// projection itself rather than guessed, at about the size the panel runs at.
const WORLD_WIDTH = 2 * Math.PI * projectionFor(1330, 380).scale();

// Half a pixel at the closest the level is ever drawn, which for the finest is
// the deepest zoom the panel allows. A point nearer its neighbours than that
// can never be told apart from them, so carrying it is dead weight.
const toleranceFor = (level: DetailLevel): number => {
    const closest =
        DETAIL_LEVELS.find((next) => next.from > level.from)?.from ?? MAX_SCALE;
    return 360 / (WORLD_WIDTH * closest) / 2;
};

const cellsFor = async (level: DetailLevel) => {
    const [land, water, borders] = await Promise.all([
        countriesFor(level.source),
        layerFor(level.lakes),
        layerFor(level.borders),
    ]);

    const tolerance = toleranceFor(level);
    const into = new URL(`${level.name}/`, OUTPUT);
    const keys: string[] = [];
    let bytes = 0;

    for (let west = -180; west < 180; west += level.degrees) {
        for (let south = -90; south < 90; south += level.degrees) {
            const key = detailCellKey(west, south);
            const bounds = boundsOf(key, level.degrees);

            // Each shape is clipped whole, holes included, so an island in a
            // lake stays an island.
            const cut = (shapes: Shape[], take: "closed" | "open") =>
                shapes
                    .filter((shape) => overlaps(shape.bounds, bounds))
                    .map(
                        (shape) =>
                            clipTo(bounds, shape.geometry, tolerance)[take],
                    )
                    .filter((parts) => parts.length > 0);

            // Every position on the grid gets a file, open sea included, so a
            // cell can never be missing. Leaving the empty ones out meant the
            // panel had to read a 404 as "nothing here", and a request that
            // failed for any other reason, such as landing mid-rebuild, was
            // then remembered as empty ground for as long as the tab lived.
            // The empty ones cost about forty bytes each.
            const cell: CellShapes = {
                land: cut(land, "closed"),
                water: cut(water, "closed"),
                borders: cut(borders, "open").flat(),
            };

            const body = JSON.stringify(cell);
            await Bun.write(new URL(`${key}.json`, into), body);
            keys.push(key);
            bytes += body.length;
        }
    }

    process.stdout.write(
        `${level.name}: ${keys.length} cells, ${(bytes / 1024 / 1024).toFixed(1)} MB total, ${(bytes / keys.length / 1024).toFixed(0)} KB average\n`,
    );
};

await Bun.$`rm -rf ${OUTPUT.pathname}`.quiet();
for (const level of DETAIL_LEVELS) await cellsFor(level);

process.stdout.write(`Wrote map detail to ${OUTPUT.pathname}\n`);
