import { describe, expect, test } from "bun:test";
import {
    boundsOnPanel,
    CLUSTER_EXTENT,
    CLUSTER_RADIUS,
    clusterZoomFor,
    constrainView,
    fitViewFor,
    heldView,
    MAX_CLUSTER_ZOOM,
    MAX_SCALE,
    minScaleFor,
    projectionFor,
    radiusFor,
    scaleForClusterZoom,
    viewProjectionFor,
} from "@/components/dashboard/location-map-data";
import type { Place } from "@/components/dashboard/data";

const WIDTH = 900;
const HEIGHT = 420;

const place = (
    city: string,
    latitude: number,
    longitude: number,
    count = 1,
): Place => ({
    label: `${city}, Somewhere`,
    city,
    region: "Somewhere",
    country: "Someland",
    latitude,
    longitude,
    count,
});

const TORONTO = place("Toronto", 43.65, -79.38);
const WATERLOO = place("Waterloo", 43.47, -80.52);
const SYDNEY = place("Sydney", -33.87, 151.21);

// Where a place lands on screen once the fitted view is applied.
const screenPointFor = (
    target: Place,
    places: readonly Place[],
): [number, number] => {
    const view = fitViewFor(places, WIDTH, HEIGHT);
    const point = projectionFor(
        WIDTH,
        HEIGHT,
    )([target.longitude, target.latitude]);
    if (!point) throw new Error(`${target.city} did not project.`);
    return [point[0] * view.k + view.x, point[1] * view.k + view.y];
};

describe("projectionFor", () => {
    test("puts the northern hemisphere above the southern", () => {
        const projection = projectionFor(WIDTH, HEIGHT);
        const north = projection([0, 60]);
        const south = projection([0, -30]);

        expect(north?.[1]).toBeLessThan(south?.[1] ?? 0);
    });

    test("puts west of Greenwich left of east of it", () => {
        const projection = projectionFor(WIDTH, HEIGHT);

        expect(projection([-80, 0])?.[0]).toBeLessThan(
            projection([80, 0])?.[0] ?? 0,
        );
    });
});

describe("fitViewFor", () => {
    test("centres a single city in the panel", () => {
        const [x, y] = screenPointFor(TORONTO, [TORONTO]);

        expect(x).toBeCloseTo(WIDTH / 2, 6);
        expect(y).toBeCloseTo(HEIGHT / 2, 6);
    });

    test("holds every city inside the panel, opposite ends of the earth included", () => {
        const places = [TORONTO, WATERLOO, SYDNEY];

        for (const target of places) {
            const [x, y] = screenPointFor(target, places);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(WIDTH);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(HEIGHT);
        }
    });

    test("zooms further into two neighbouring cities than into two distant ones", () => {
        const near = fitViewFor([TORONTO, WATERLOO], WIDTH, HEIGHT);
        const far = fitViewFor([TORONTO, SYDNEY], WIDTH, HEIGHT);

        expect(near.k).toBeGreaterThan(far.k);
    });

    test("never zooms past the point where outlines still carry detail", () => {
        expect(fitViewFor([TORONTO], WIDTH, HEIGHT).k).toBeLessThanOrEqual(8);
    });

    test("falls back to the whole world when there is nothing to fit", () => {
        expect(fitViewFor([], WIDTH, HEIGHT).k).toBe(
            minScaleFor(WIDTH, HEIGHT),
        );
        expect(fitViewFor([TORONTO], 0, 0)).toEqual({ x: 0, y: 0, k: 1 });
    });

    test("opens on a view that is already inside the map", () => {
        const places = [TORONTO, WATERLOO, SYDNEY];
        const view = fitViewFor(places, WIDTH, HEIGHT);

        expect(constrainView(view, WIDTH, HEIGHT)).toEqual(view);
    });
});

// Clamping lands the edge exactly on the panel border, where the arithmetic can
// miss by a billionth of a pixel either way.
const TOUCHING = 1e-6;

// Where the frame's corners land on the panel once the view is applied.
const boundsOf = (
    view: ReturnType<typeof fitViewFor>,
    width = WIDTH,
    height = HEIGHT,
) => {
    const projection = projectionFor(width, height);
    const corner = (longitude: number, latitude: number) => {
        const point = projection([longitude, latitude]);
        if (!point) throw new Error("corner did not project.");
        return [point[0] * view.k + view.x, point[1] * view.k + view.y];
    };
    const [left, top] = corner(-180, 80);
    const [right, bottom] = corner(180, -58);
    return { left, right, top, bottom };
};

describe("constrainView", () => {
    test("refuses to let the map be dragged off to one side", () => {
        const thrown = constrainView(
            { k: 4, x: 90_000, y: 60_000 },
            WIDTH,
            HEIGHT,
        );
        const { left, right, top, bottom } = boundsOf(thrown);

        expect(left).toBeLessThanOrEqual(TOUCHING);
        expect(right).toBeGreaterThanOrEqual(WIDTH - TOUCHING);
        expect(top).toBeLessThanOrEqual(TOUCHING);
        expect(bottom).toBeGreaterThanOrEqual(HEIGHT - TOUCHING);
    });

    test("holds the far side just as firmly", () => {
        const thrown = constrainView(
            { k: 4, x: -90_000, y: -60_000 },
            WIDTH,
            HEIGHT,
        );
        const { left, right } = boundsOf(thrown);

        expect(left).toBeLessThanOrEqual(TOUCHING);
        expect(right).toBeGreaterThanOrEqual(WIDTH - TOUCHING);
    });

    test("leaves a view that already sits inside the panel alone", () => {
        const inside = constrainView(
            { k: 4, x: -1200, y: -400 },
            WIDTH,
            HEIGHT,
        );

        expect(constrainView(inside, WIDTH, HEIGHT)).toEqual(inside);
    });

    test("keeps the scale within the zoom the map is built for", () => {
        expect(constrainView({ k: 9_999, x: 0, y: 0 }, WIDTH, HEIGHT).k).toBe(
            MAX_SCALE,
        );
        expect(constrainView({ k: 0.01, x: 0, y: 0 }, WIDTH, HEIGHT).k).toBe(
            minScaleFor(WIDTH, HEIGHT),
        );
    });
});

describe("minScaleFor", () => {
    // A phone panel is far taller than the frame's shape.
    const PHONE_WIDTH = 372;
    const PHONE_HEIGHT = 380;

    test("covers the panel whatever shape the panel is", () => {
        for (const [width, height] of [
            [PHONE_WIDTH, PHONE_HEIGHT],
            [WIDTH, HEIGHT],
        ]) {
            const k = minScaleFor(width, height);
            const { left, right, top, bottom } = boundsOf(
                constrainView({ k, x: 0, y: 0 }, width, height),
                width,
                height,
            );

            expect(right - left).toBeGreaterThanOrEqual(width - TOUCHING);
            expect(bottom - top).toBeGreaterThanOrEqual(height - TOUCHING);
        }
    });

    // Fitting the frame inside a phone panel pinned the map: it filled the
    // width exactly and fell short of the height, so neither side had anywhere
    // to go and every drag died on the spot.
    test("leaves the lowest zoom somewhere to be dragged to", () => {
        const k = minScaleFor(PHONE_WIDTH, PHONE_HEIGHT);
        const opened = constrainView(
            { k, x: 0, y: 0 },
            PHONE_WIDTH,
            PHONE_HEIGHT,
        );
        const dragged = constrainView(
            { ...opened, x: opened.x - 50 },
            PHONE_WIDTH,
            PHONE_HEIGHT,
        );

        expect(dragged.x).toBeLessThan(opened.x);
    });
});

describe("radiusFor", () => {
    test("gives four times the applications four times the area", () => {
        const four = radiusFor(4, 25);
        const sixteen = radiusFor(16, 25);

        expect(sixteen ** 2 / four ** 2).toBeCloseTo(4, 6);
    });

    test("fills the panel with the busiest city whatever its count", () => {
        expect(radiusFor(7, 7)).toBe(radiusFor(700, 700));
    });

    // The one place the area stops being proportional. A city with a single
    // application would otherwise shrink below a pixel beside a busy one, and
    // an invisible dot reads as no application at all.
    test("keeps a lone application visible beside a busy city", () => {
        expect(radiusFor(1, 500)).toBeGreaterThanOrEqual(3);
    });

    test("draws nothing for a count of none", () => {
        expect(radiusFor(0, 10)).toBe(0);
        expect(radiusFor(5, 0)).toBe(0);
    });
});

describe("clusterZoomFor", () => {
    test("asks for a deeper level as the map is zoomed in", () => {
        const scale = projectionFor(WIDTH, HEIGHT).scale();

        expect(clusterZoomFor(scale * 8)).toBeGreaterThan(
            clusterZoomFor(scale * 1),
        );
    });

    test("counts one level per doubling of the view", () => {
        const scale = projectionFor(WIDTH, HEIGHT).scale();

        expect(clusterZoomFor(scale * 4) - clusterZoomFor(scale * 2)).toBe(1);
    });

    test("stays within the levels the index is built for", () => {
        const scale = projectionFor(WIDTH, HEIGHT).scale();

        expect(clusterZoomFor(scale * (1 / 1000))).toBe(0);
        expect(clusterZoomFor(scale * 100_000)).toBe(MAX_CLUSTER_ZOOM);
    });

    test("turns a level back into the scale that asks for it", () => {
        const scale = projectionFor(WIDTH, HEIGHT).scale();

        for (const zoom of [2, 3, 4, 5]) {
            expect(
                clusterZoomFor(
                    scale *
                        scaleForClusterZoom(
                            scale,
                            zoom,
                            minScaleFor(WIDTH, HEIGHT),
                        ),
                ),
            ).toBe(zoom);
        }
    });
});

describe("CLUSTER_EXTENT", () => {
    // Clustering measures its radius against the extent, while clusterZoomFor
    // counts levels against a tile. When the two disagreed the radius meant
    // half what it said, so two groups could sit a circle's width apart and be
    // drawn one on top of the other.
    test("merges groups before their circles can cover each other", () => {
        const base = projectionFor(WIDTH, HEIGHT).scale();
        const widest = radiusFor(1, 1) * 2;

        for (let step = 0; step <= 200; step += 1) {
            const scale = base * 2 ** ((step / 200) * 10);
            const merged =
                (2 * Math.PI * scale * CLUSTER_RADIUS) /
                (CLUSTER_EXTENT * 2 ** clusterZoomFor(scale));

            expect(merged).toBeGreaterThanOrEqual(widest);
        }
    });
});

describe("viewProjectionFor", () => {
    const view = { k: 6, x: -1200, y: -430 };

    // The whole point of moving the projection rather than scaling a finished
    // drawing: the outlines have to land in exactly the same place either way,
    // or the pan and zoom maths above would be describing a different map.
    test("lands a city where scaling the drawing would have put it", () => {
        const base = projectionFor(WIDTH, HEIGHT);
        const drawn = viewProjectionFor(WIDTH, HEIGHT, view);

        for (const place of [TORONTO, WATERLOO, SYDNEY]) {
            const at = base([place.longitude, place.latitude]);
            const moved = drawn([place.longitude, place.latitude]);
            if (!at || !moved)
                throw new Error(`${place.city} did not project.`);

            expect(moved[0]).toBeCloseTo(at[0] * view.k + view.x, 6);
            expect(moved[1]).toBeCloseTo(at[1] * view.k + view.y, 6);
        }
    });

    test("asks clustering for the level the zoom actually shows", () => {
        const base = projectionFor(WIDTH, HEIGHT).scale();
        const drawn = viewProjectionFor(WIDTH, HEIGHT, view);

        expect(clusterZoomFor(drawn.scale())).toBe(
            clusterZoomFor(base * view.k),
        );
    });

    // d3 cuts a shape that covers the whole panel without crossing it into a
    // wedge, so ground the panel sits inside comes out half sea. Clipping was
    // only ever a saving, and the SVG viewport hides the overspill.
    test("leaves what falls outside the panel alone", () => {
        expect(viewProjectionFor(WIDTH, HEIGHT, view).clipExtent()).toBeNull();
    });
});

// The coarse outlines carry every country on earth, and all of them are
// streamed through the projection to build the path. Zoomed in, the panel can
// show three of them.
describe("boundsOnPanel", () => {
    const viewOver = (place: Place, k: number) => {
        const point = projectionFor(
            WIDTH,
            HEIGHT,
        )([place.longitude, place.latitude]);
        if (!point) throw new Error(`${place.city} did not project.`);
        return viewProjectionFor(WIDTH, HEIGHT, {
            k,
            x: WIDTH / 2 - point[0] * k,
            y: HEIGHT / 2 - point[1] * k,
        });
    };

    const around = (place: Place): [[number, number], [number, number]] => [
        [place.longitude - 1, place.latitude - 1],
        [place.longitude + 1, place.latitude + 1],
    ];

    const CLOSE_IN = viewOver(TORONTO, 8);
    const WHOLE_MAP = viewProjectionFor(WIDTH, HEIGHT, { k: 1, x: 0, y: 0 });

    test("keeps the ground the panel is over", () => {
        expect(boundsOnPanel(around(TORONTO), CLOSE_IN, WIDTH, HEIGHT)).toBe(
            true,
        );
    });

    test("drops the far side of the world", () => {
        expect(boundsOnPanel(around(SYDNEY), CLOSE_IN, WIDTH, HEIGHT)).toBe(
            false,
        );
    });

    test("keeps everything while the panel holds the whole map", () => {
        expect(boundsOnPanel(around(SYDNEY), WHOLE_MAP, WIDTH, HEIGHT)).toBe(
            true,
        );
    });

    // Working out which side of the map such a shape is on is a good deal more
    // work than the drawing it would save.
    test("keeps a shape that wraps the date line rather than working it out", () => {
        expect(
            boundsOnPanel(
                [
                    [170, -10],
                    [-170, 10],
                ],
                CLOSE_IN,
                WIDTH,
                HEIGHT,
            ),
        ).toBe(true);
    });
});

describe("heldView", () => {
    const inside = { k: 4, x: -1200, y: -400 };

    // Trimming the scale while keeping the translation that came with it left
    // the two describing different views, and the map jumped somewhere else
    // every time you tried to zoom past the end.
    test("refuses a zoom past the far end rather than moving the map", () => {
        const tooClose = { k: MAX_SCALE * 2, x: -900_000, y: -300_000 };

        expect(heldView(tooClose, inside, WIDTH, HEIGHT)).toEqual(inside);
    });

    test("refuses a zoom past the near end the same way", () => {
        const tooFar = { k: 0.2, x: 40, y: 10 };

        expect(heldView(tooFar, inside, WIDTH, HEIGHT)).toEqual(inside);
    });

    test("still holds a zoom inside the limits within the map", () => {
        const thrown = { k: 4, x: 90_000, y: 60_000 };

        expect(heldView(thrown, inside, WIDTH, HEIGHT)).toEqual(
            constrainView(thrown, WIDTH, HEIGHT),
        );
    });

    test("lets a zoom to the very limit through", () => {
        const atLimit = { k: MAX_SCALE, x: -100, y: -100 };

        expect(heldView(atLimit, inside, WIDTH, HEIGHT).k).toBe(MAX_SCALE);
    });
});
