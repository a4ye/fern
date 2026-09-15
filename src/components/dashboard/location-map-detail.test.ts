import { describe, expect, test } from "bun:test";
import {
    boundsOf,
    cellFrom,
    DETAIL_LEVELS,
    detailCellKey,
    detailCellsFor,
    detailEdgePath,
    detailEdges,
    detailFillPath,
    detailLevelFor,
    placementFor,
    ringFrom,
    type DetailCell,
    type Placement,
} from "@/components/dashboard/location-map-detail";
import {
    projectionFor,
    viewProjectionFor,
} from "@/components/dashboard/location-map-data";
import type { Position } from "geojson";

const WIDTH = 1326;
const HEIGHT = 380;

// A view of the given scale, centred on somewhere real.
const viewOver = (longitude: number, latitude: number, k: number) => {
    const base = projectionFor(WIDTH, HEIGHT);
    const point = base([longitude, latitude]);
    if (!point) throw new Error("centre did not project.");
    return viewProjectionFor(WIDTH, HEIGHT, {
        k,
        x: WIDTH / 2 - point[0] * k,
        y: HEIGHT / 2 - point[1] * k,
    });
};

const BAY_AREA: [number, number] = [-122.3, 37.7];

const [COARSER, FINER] = DETAIL_LEVELS;

const cellsAt = (scale: number, at: [number, number] = BAY_AREA) =>
    detailCellsFor(viewOver(...at, scale), WIDTH, HEIGHT, scale);

describe("detailLevelFor", () => {
    test("draws the coarse outlines until the panel is close enough", () => {
        expect(detailLevelFor(COARSER.from - 1)).toBeNull();
    });

    test("steps up a level as the panel closes in", () => {
        expect(detailLevelFor(COARSER.from)?.name).toBe(COARSER.name);
        expect(detailLevelFor(FINER.from - 1)?.name).toBe(COARSER.name);
        expect(detailLevelFor(FINER.from)?.name).toBe(FINER.name);
        expect(detailLevelFor(FINER.from * 8)?.name).toBe(FINER.name);
    });

    test("cuts the coarser data into bigger cells", () => {
        expect(COARSER.degrees).toBeGreaterThan(FINER.degrees);
    });
});

describe("detailCellsFor", () => {
    test("asks for the cell the panel is actually over", () => {
        const holding = (value: number) =>
            Math.floor(value / FINER.degrees) * FINER.degrees;

        expect(cellsAt(512)?.keys).toContain(
            detailCellKey(holding(BAY_AREA[0]), holding(BAY_AREA[1])),
        );
    });

    test("stays quiet until the view is close enough to need detail", () => {
        expect(cellsAt(COARSER.from - 1)).toBeNull();
    });

    test("moves to the finer level as the panel closes in", () => {
        expect(cellsAt(COARSER.from)?.level.name).toBe(COARSER.name);
        expect(cellsAt(512)?.level.name).toBe(FINER.name);
    });

    test("asks for fewer cells the further in the panel goes", () => {
        const near = cellsAt(512)?.keys ?? [];
        const wide = cellsAt(FINER.from)?.keys ?? [];

        expect(near.length).toBeLessThanOrEqual(wide.length);
        expect(near.length).toBeGreaterThan(0);
    });

    test("gives up rather than firing off a request per cell", () => {
        // A panel spanning far more ground than the grid was cut for, which is
        // the case the cap exists to catch.
        expect(
            detailCellsFor(
                viewOver(0, 0, FINER.from),
                WIDTH * 40,
                HEIGHT * 40,
                FINER.from,
            ),
        ).toBeNull();
    });

    test("names cells on the grid its level was cut along", () => {
        const view = cellsAt(512);
        expect(view).not.toBeNull();

        for (const key of view?.keys ?? []) {
            const [west, south] = key.split("_").map(Number);
            expect(west % (view?.level.degrees ?? 1) === 0).toBe(true);
            expect(south % (view?.level.degrees ?? 1) === 0).toBe(true);
            expect(detailCellKey(west, south)).toBe(key);
        }
    });
});

// Base coordinates go straight down when the placement neither scales them nor
// moves them, which makes a path readable.
const AS_IS: Placement = { scale: 1, x: 0, y: 0, width: 100, height: 100 };

const cellOf = (key: string, ...rings: Position[][]): DetailCell => ({
    key,
    land: rings.map(ringFrom),
    water: [],
    borders: [],
    edges: [],
});

describe("detailFillPath", () => {
    const square = (at: number): Position[] => [
        [at, 0],
        [at + 1, 0],
        [at + 1, 1],
        [at, 1],
    ];

    test("closes every ring, so each one fills", () => {
        expect(detailFillPath([cellOf("0_0", square(0))], AS_IS)).toBe(
            "M0,0L1,0L1,1L0,1Z",
        );
    });

    test("draws every cell into one path", () => {
        const path = detailFillPath(
            [cellOf("0_0", square(0)), cellOf("10_0", square(5), square(9))],
            AS_IS,
        );

        expect(path.match(/Z/g)).toHaveLength(3);
        expect(path.startsWith("M0,0")).toBe(true);
    });

    test("leaves out a point that lands nowhere", () => {
        const path = detailFillPath(
            [
                cellOf("0_0", [
                    [0, 0],
                    [Infinity, 0],
                    [0, 1],
                ]),
            ],
            AS_IS,
        );

        expect(path).toBe("M0,0L0,1Z");
    });

    test("has nothing to draw before any cell arrives", () => {
        expect(detailFillPath([], AS_IS)).toBe("");
    });

    // The panel rebuilds every path on every frame of a pan, and hands the text
    // to the browser to parse again each time. A coordinate printed in full runs
    // to seventeen digits to place a point inside a ten-thousandth of a pixel,
    // which no screen can show.
    test("places a point to a tenth of a pixel, not to a millionth", () => {
        expect(
            detailFillPath([cellOf("0_0", square(0))], {
                ...AS_IS,
                scale: 1 / 3,
            }),
        ).toBe("M0,0L0.3,0L0.3,0.3L0,0.3Z");
    });

    test("drops a point that lands where the pen already is", () => {
        expect(
            detailFillPath([cellOf("0_0", square(0))], {
                ...AS_IS,
                scale: 1 / 1000,
            }),
        ).toBe("M0,0Z");
    });
});

// A cell is cut to a grid, not to the panel, so most of one is off screen once
// the map is zoomed in. What the panel cannot show costs as much to build as
// what it can, and at the deepest zoom it is most of the cell.
describe("drawing only what the panel can show", () => {
    const AWAY: Position[] = [
        [200, 200],
        [300, 200],
        [300, 300],
    ];

    test("leaves out a ring that falls outside the panel", () => {
        expect(detailFillPath([cellOf("0_0", AWAY)], AS_IS)).toBe("");
    });

    test("draws the rings that are on the panel either way", () => {
        const alone = detailFillPath(
            [
                cellOf("0_0", [
                    [1, 1],
                    [2, 1],
                    [2, 2],
                ]),
            ],
            AS_IS,
        );
        const beside = detailFillPath(
            [
                cellOf(
                    "0_0",
                    [
                        [1, 1],
                        [2, 1],
                        [2, 2],
                    ],
                    AWAY,
                ),
            ],
            AS_IS,
        );

        expect(beside).toBe(alone);
    });

    // The ground the panel sits in the middle of never has a point on screen.
    // Dropping it would leave the sea it encloses unpainted, which is the one
    // way this saving could show.
    test("keeps a ring the panel sits inside", () => {
        const path = detailFillPath(
            [
                cellOf("0_0", [
                    [-50, -50],
                    [150, -50],
                    [150, 150],
                    [-50, 150],
                ]),
            ],
            AS_IS,
        );

        expect(path).toBe("M-50,-50L150,-50L150,150L-50,150Z");
    });

    // A line along the panel's edge is drawn with a stroke, which reaches half
    // its width inside the panel even when the line itself is outside it.
    test("keeps a ring close enough for its stroke to show", () => {
        const path = detailFillPath(
            [
                cellOf("0_0", [
                    [-1, 10],
                    [-1, 40],
                ]),
            ],
            AS_IS,
        );

        expect(path).toBe("M-1,10L-1,40Z");
    });
});

// Every view of a Mercator is every other view scaled and moved, which is what
// lets a cell be projected once when it arrives and only scaled and moved after
// that. If the two ever disagreed, the coastline would sit off the cities.
describe("cellFrom", () => {
    const COAST: Position[] = [
        [-122.4, 37.8],
        [-122.3, 37.8],
        [-122.3, 37.7],
    ];

    test("puts a coastline where projecting it every frame would have", () => {
        const drawn = viewOver(...BAY_AREA, 256);
        const tenth = (value: number) => Math.round(value * 10) / 10;
        const wanted = COAST.map((point) => {
            const at = drawn([point[0], point[1]]);
            if (!at) throw new Error("coast did not project.");
            return `${tenth(at[0])},${tenth(at[1])}`;
        });

        const cell = cellFrom("-125_35", FINER.degrees, {
            land: [[COAST]],
            water: [],
            borders: [],
        });

        expect(detailFillPath([cell], placementFor(drawn, WIDTH, HEIGHT))).toBe(
            `M${wanted.join("L")}Z`,
        );
    });
});

describe("detailEdges", () => {
    // An island well inside its cell: every side of it is real coastline.
    const ISLAND: Position[] = [
        [2, 2],
        [4, 2],
        [4, 4],
        [2, 4],
    ];

    // A headland cut by the cell's western side, which the clip closed along
    // that side. Cells are cut to overlap, so that side sits just outside the
    // round number, and the two points on it are the false edge.
    const WEST = boundsOf("0_0", FINER.degrees).west;
    const CUT: Position[] = [
        [WEST, 2],
        [3, 3],
        [WEST, 6],
    ];

    const landOf = (key: string, ring: Position[]) =>
        detailEdges(
            { land: [[ring]], water: [], borders: [] },
            boundsOf(key, FINER.degrees),
        );

    test("keeps a shape that never touches the cell's sides whole", () => {
        expect(landOf("0_0", ISLAND)).toEqual([[...ISLAND, ISLAND[0]]]);
    });

    test("drops the side the clip closed along", () => {
        expect(landOf("0_0", CUT)).toEqual([
            [
                [WEST, 2],
                [3, 3],
                [WEST, 6],
            ],
        ]);
    });

    // The two sides of a shared border are cut at slightly different
    // longitudes, because the cells overlap. Each one still has to drop its own.
    test("never draws a line down a border two cells share", () => {
        const EAST = boundsOf("-10_0", FINER.degrees).east;
        const edges = [
            ...landOf("0_0", CUT),
            ...landOf("-10_0", [
                [EAST, 2],
                [-3, 3],
                [EAST, 6],
            ]),
        ];

        for (const line of edges) {
            for (let at = 0; at + 1 < line.length; at += 1) {
                const [ax] = line[at];
                const [bx] = line[at + 1];
                expect(ax === bx && (ax === WEST || ax === EAST)).toBe(false);
            }
        }
    });

    test("has nothing to draw before any cell arrives", () => {
        expect(
            detailEdges(
                { land: [], water: [], borders: [] },
                boundsOf("0_0", FINER.degrees),
            ),
        ).toEqual([]);
        expect(detailEdgePath([], AS_IS)).toBe("");
    });

    test("draws the coastline open, never closed back on itself", () => {
        const cell = cellFrom("0_0", FINER.degrees, {
            land: [[CUT]],
            water: [],
            borders: [],
        });

        expect(
            detailEdgePath(
                [cell],
                placementFor(viewOver(1.5, 4, 1), WIDTH, HEIGHT),
            ),
        ).not.toContain("Z");
    });
});
