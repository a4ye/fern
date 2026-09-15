import { describe, expect, test } from "bun:test";
import type { Position } from "geojson";
import {
    boundsOf,
    DETAIL_CELL_OVERLAP,
    DETAIL_LEVELS,
    detailCellKey,
    detailEdges,
    type CellShapes,
} from "@/components/dashboard/location-map-detail";

// Clipping the world into cells is easy to get subtly wrong in a way that still
// draws something: a first attempt with Sutherland-Hodgman stitched a coastline
// that wove in and out of a cell into diagonals straight across it. Asking
// whether known places come out as land or sea catches that, where counting
// points or bytes would not.
// The finest level, the one a close look actually draws.
const LEVEL = DETAIL_LEVELS[DETAIL_LEVELS.length - 1];
const CELLS = new URL(`../public/map-detail/${LEVEL.name}/`, import.meta.url);

// Exactly what an SVG fill does: the nonzero winding rule, in the plane. The
// spherical test d3 offers reads the rings the other way round and would call
// the sea land.
// Lakes are painted over the land, so ground only reads as land when the land
// covers it and no lake does.
const drawsAsLand = (cell: CellShapes, at: Position): boolean =>
    filled(cell.land, at) && !filled(cell.water, at);

const filled = (polygons: Position[][][], [px, py]: Position): boolean => {
    let winding = 0;
    for (const rings of polygons) {
        for (const ring of rings) {
            for (let at = 0; at < ring.length; at += 1) {
                const [ax, ay] = ring[at];
                const [bx, by] = ring[(at + 1) % ring.length];
                const side = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
                if (ay <= py) {
                    if (by > py && side > 0) winding += 1;
                } else if (by <= py && side < 0) winding -= 1;
            }
        }
    }
    return winding !== 0;
};

// Which cell holds a place, worked out from the grid rather than written down,
// so changing how finely the world is cut does not strand the tests.
const cellHolding = (longitude: number, latitude: number): string =>
    detailCellKey(
        Math.floor(longitude / LEVEL.degrees) * LEVEL.degrees,
        Math.floor(latitude / LEVEL.degrees) * LEVEL.degrees,
    );

const EMPTY: CellShapes = {
    land: [],
    water: [],
    borders: [],
};

// A cell with nothing in it is never written, which is how open sea is stored:
// the panel paints nothing and the background reads as water. A cell missing
// because the whole set was never built is a different matter, so the two are
// told apart rather than both quietly passing.
const cellFor = async (key: string): Promise<CellShapes> => {
    const file = Bun.file(new URL(`${key}.json`, CELLS));
    if (await file.exists()) return (await file.json()) as CellShapes;

    const anyCell = Bun.file(new URL("0_50.json", CELLS));
    if (!(await anyCell.exists())) {
        throw new Error(
            `No map detail cells at all. Run \`bun run map:build\`.`,
        );
    }
    return EMPTY;
};

describe("the map detail cells", () => {
    test.each([
        ["the Pacific west of San Francisco", -124.0, 37.5, false],
        ["San Francisco", -122.42, 37.77, true],
        ["San Francisco Bay", -122.32, 37.83, false],
        ["the Central Valley", -121.0, 37.5, true],
        ["Puget Sound", -122.5, 47.9, false],
        ["Seattle", -122.33, 47.6, true],
        ["North Dakota", -100.5, 47.0, true],
        ["Saskatchewan, over the border", -105.0, 49.5, true],
        ["London", 0.0, 51.5, true],
        ["the North Sea", 2.5, 55.0, false],
        ["Tokyo", 139.7, 35.7, true],
        ["the Pacific east of Japan", 143.0, 35.0, false],
    ])("draws %s correctly", async (_name, longitude, latitude, land) => {
        const cell = await cellFor(cellHolding(longitude, latitude));

        expect(drawsAsLand(cell, [longitude, latitude])).toBe(land);
    });

    // Natural Earth's countries hold no inland water, so without the lakes laid
    // over them a lake draws as a field. Erie used to half appear through the
    // gap the border between two countries leaves down the middle of it, which
    // is why the lakes disagreed with each other.
    test.each([
        ["Lake Ontario", -77.9, 43.7],
        ["Lake Erie", -81.2, 42.2],
        ["Lake Michigan", -87.0, 43.5],
        ["Lake Superior", -87.5, 47.5],
        ["Lake Victoria", 33.0, -1.5],
        ["the Caspian Sea", 51.0, 41.5],
    ])("draws %s as water", async (_name, longitude, latitude) => {
        const cell = await cellFor(cellHolding(longitude, latitude));

        expect(drawsAsLand(cell, [longitude, latitude])).toBe(false);
    });

    // A cell with no coast has no edge to clip, so it comes back empty unless
    // the clipper fills it. Left empty it would draw a square of open sea in
    // the middle of a continent.
    test("fills a cell that lies wholly inland", async () => {
        const cell = await cellFor(cellHolding(25.0, 15.0));

        expect(drawsAsLand(cell, [25.0, 15.0])).toBe(true);
    });

    const longitudes = (cell: CellShapes) => {
        const rings = cell.land;
        let low = Infinity;
        let high = -Infinity;
        for (const polygon of rings) {
            for (const ring of polygon) {
                for (const [x] of ring) {
                    low = Math.min(low, x);
                    high = Math.max(high, x);
                }
            }
        }
        return { low, high };
    };

    // Two shapes that merely touch leave a hairline of background showing
    // between them wherever the renderer antialiases the shared edge, which
    // draws the grid over the map. Overlapping leaves nothing to show through.
    test("cuts neighbouring cells so they overlap rather than touch", async () => {
        const border = -120;
        const west = longitudes(
            await cellFor(cellHolding(border - LEVEL.degrees / 2, 37)),
        );
        const east = longitudes(await cellFor(cellHolding(border + 1, 37)));

        expect(west.high).toBeGreaterThan(border);
        expect(east.low).toBeLessThan(border);
        expect(west.high).toBeGreaterThan(east.low);
    });

    test("never draws a cell's own sides as coastline", async () => {
        for (const key of [
            cellHolding(-122.4, 37.7),
            cellHolding(-118.0, 37.7),
            cellHolding(0.0, 51.5),
        ]) {
            const bounds = boundsOf(key, LEVEL.degrees);
            const edges = detailEdges(await cellFor(key), bounds);

            for (const line of edges) {
                for (let at = 0; at + 1 < line.length; at += 1) {
                    const [ax, ay] = line[at];
                    const [bx, by] = line[at + 1];
                    const alongSide =
                        (ax === bx &&
                            (ax === bounds.west || ax === bounds.east)) ||
                        (ay === by &&
                            (ay === bounds.south || ay === bounds.north));
                    expect(alongSide).toBe(false);
                }
            }
        }
    });

    // Neighbouring cells overlap so their shared edge has no hairline of
    // background showing through. That overlap only works if each cell is drawn
    // through its own path. Merged into one, the nonzero fill rule adds their
    // winding numbers, and rings that happen to run opposite ways cancel and
    // punch a bare band along the whole shared edge, tens of pixels wide at
    // close zoom. Every ground that either cell covers must stay covered.
    test("keeps the overlap between two cells covered", async () => {
        const winding = (rings: Position[][], [px, py]: Position) => {
            let turns = 0;
            for (const ring of rings) {
                for (let at = 0; at < ring.length; at += 1) {
                    const [ax, ay] = ring[at];
                    const [bx, by] = ring[(at + 1) % ring.length];
                    const side = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
                    if (ay <= py) {
                        if (by > py && side > 0) turns += 1;
                    } else if (by <= py && side < 0) turns -= 1;
                }
            }
            return turns;
        };

        let checked = 0;
        for (let lon = -120; lon <= -85; lon += LEVEL.degrees) {
            for (let lat = 30; lat <= 45; lat += 3) {
                const row = Math.floor(lat / LEVEL.degrees) * LEVEL.degrees;
                const west = (
                    await cellFor(detailCellKey(lon - LEVEL.degrees, row))
                ).land.flat();
                const east = (
                    await cellFor(detailCellKey(lon, row))
                ).land.flat();

                const at: Position = [lon - DETAIL_CELL_OVERLAP / 2, lat];
                const apart =
                    winding(west, at) !== 0 || winding(east, at) !== 0;
                if (!apart) continue;

                checked += 1;
                expect(apart).toBe(true);
            }
        }
        expect(checked).toBeGreaterThan(0);
    });
});
