import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { Polygon } from "geojson";
import type { Place } from "@/components/dashboard/data";

export type MapView = { x: number; y: number; k: number };

export const MIN_SCALE = 1;

// Deep enough that no two cities are stuck together. Clustering merges what is
// within CLUSTER_RADIUS pixels, and that distance shrinks as the map is zoomed:
// stopping at 64 held the merge distance at about 78 km, so neighbours like
// Boston and Cambridge could never be pulled apart however far you zoomed.
export const MAX_SCALE = 1024;

// Roughly the width of the largest circles, so merging stops at about the point
// where the circles would stop touching.
export const CLUSTER_RADIUS = 44;

// Mercator runs to 85 degrees, where Antarctica is wider than Africa and the
// inhabited world is squeezed into a band. Framing the latitudes people work in
// spends the panel on places that can hold a pin.
const FRAME: Polygon = {
    type: "Polygon",
    coordinates: [
        [
            [-180, -58],
            [180, -58],
            [180, 80],
            [-180, 80],
            [-180, -58],
        ],
    ],
};

// Room for the largest circle, so a city on the edge of the fit is not sliced
// in half by the frame.
const FIT_PADDING = 40;

// One city carries no span to fit, which would ask for the deepest zoom and
// draw an empty frame: country outlines hold no detail at street level.
const MAX_FIT_SCALE = 8;

// Small enough that neighbours stay apart: at the zoom that fits a spread of
// cities, Toronto and New York are some thirty pixels apart, and a circle that
// swallows that gap hides the very thing the map is for.
const MAX_RADIUS = 15;
const MIN_RADIUS = 3;

// Web Mercator counts a zoom level per doubling of a 256 pixel world.
const TILE_SIZE = 256;
export const MAX_CLUSTER_ZOOM = 12;

// Clustering measures its radius against this rather than against the panel, so
// it has to be the tile the zoom levels above are counted in. Left at its own
// default of 512 the radius quietly meant half what it said, and cities a
// circle's width apart were handed back as two groups drawn over each other.
export const CLUSTER_EXTENT = TILE_SIZE;

const clamp = (value: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, value));

export const projectionFor = (width: number, height: number): GeoProjection =>
    geoMercator().fitExtent(
        [
            [0, 0],
            [width, height],
        ],
        FRAME,
    );

// Circle area, not radius, carries the count, so two cities read as twice one.
// The floor keeps a single application from shrinking out of sight next to a
// city with a hundred.
export const radiusFor = (count: number, largest: number): number => {
    if (count <= 0 || largest <= 0) return 0;
    return Math.max(MIN_RADIUS, MAX_RADIUS * Math.sqrt(count / largest));
};

// Pan and zoom belong in the projection, not in a transform wrapped around a
// finished drawing. Scaling a drawing asks the browser to blow up the picture
// it already rasterised, which goes soft until something forces it to paint
// again; moving the projection instead redraws the outlines at the size they
// are shown, so they are sharp at every zoom.
export const viewProjectionFor = (
    width: number,
    height: number,
    view: MapView,
): GeoProjection => {
    const projection = projectionFor(width, height);
    const [x, y] = projection.translate();

    // Deliberately not clipped to the panel. Dropping what falls outside would
    // be less to draw, but d3 cuts a shape that covers the whole panel without
    // crossing it into a wedge, which paints inland British Columbia as sea.
    // The SVG viewport hides the overspill, and the detail layer only ever
    // holds the cells in view, so there is little of it to hide.
    return projection
        .scale(projection.scale() * view.k)
        .translate([x * view.k + view.x, y * view.k + view.y]);
};

// A stroke reaches half its width past the outline it follows, so a shape just
// outside the panel can still show inside it.
const PANEL_EDGE = 1;

// Whether a shape can show at all, from the box of longitude and latitude
// around it. Mercator turns such a box into a box on screen, so two opposite
// corners settle the question. A shape that wraps the date line comes back with
// its east edge west of its west edge, and is kept rather than worked out.
export const boundsOnPanel = (
    [[west, south], [east, north]]: [[number, number], [number, number]],
    projection: GeoProjection,
    width: number,
    height: number,
): boolean => {
    if (east < west) return true;

    const low = projection([west, south]);
    const high = projection([east, north]);
    if (!low || !high) return true;

    return (
        Math.max(low[0], high[0]) >= -PANEL_EDGE &&
        Math.min(low[0], high[0]) <= width + PANEL_EDGE &&
        Math.max(low[1], high[1]) >= -PANEL_EDGE &&
        Math.min(low[1], high[1]) <= height + PANEL_EDGE
    );
};

// The zoom level clustering should answer at. A Mercator scale spans 2*pi*scale
// pixels for the whole world, so comparing that against the tile grid gives the
// level whose merging matches what is on screen.
export const clusterZoomFor = (projectionScale: number): number => {
    const worldWidth = 2 * Math.PI * projectionScale;
    const zoom = Math.log2(worldWidth / TILE_SIZE);
    return clamp(Math.round(zoom), 0, MAX_CLUSTER_ZOOM);
};

// The inverse, for clicking a cluster open: clustering answers in zoom levels,
// while the map is driven by a scale.
export const scaleForClusterZoom = (
    projectionScale: number,
    zoom: number,
): number =>
    clamp(
        (TILE_SIZE * 2 ** zoom) / (2 * Math.PI * projectionScale),
        MIN_SCALE,
        MAX_SCALE,
    );

// Keeps the map covering the panel, so it cannot be thrown off into empty space
// and lost. Whichever side is wider than the panel is stopped at its edge, and
// whichever is narrower, which is what letterboxing leaves at the lowest zooms,
// is centred instead: it has no travel to give.
const alongAxis = (
    translate: number,
    k: number,
    low: number,
    high: number,
    panel: number,
): number => {
    const span = (high - low) * k;
    if (span < panel) return (panel - span) / 2 - low * k;
    return clamp(translate, panel - high * k, -low * k);
};

// A zoom past the limits is refused outright rather than trimmed to fit. The
// translation that comes with it was worked out for the scale that was asked
// for, so keeping one and trimming the other leaves the two describing
// different views, and the map jumps somewhere else entirely.
export const heldView = (
    requested: MapView,
    previous: MapView,
    width: number,
    height: number,
): MapView =>
    requested.k < MIN_SCALE || requested.k > MAX_SCALE
        ? previous
        : constrainView(requested, width, height);

export const constrainView = (
    view: MapView,
    width: number,
    height: number,
): MapView => {
    if (width <= 0 || height <= 0) return view;

    const k = clamp(view.k, MIN_SCALE, MAX_SCALE);
    const [[left, top], [right, bottom]] = geoPath(
        projectionFor(width, height),
    ).bounds(FRAME);

    return {
        k,
        x: alongAxis(view.x, k, left, right, width),
        y: alongAxis(view.y, k, top, bottom, height),
    };
};

// Opens on the places the user actually applied to rather than on the whole
// world, which for most lists would be a couple of dots in an ocean of empty.
export const fitViewFor = (
    places: readonly Place[],
    width: number,
    height: number,
): MapView => {
    const whole = { x: 0, y: 0, k: 1 };
    if (width <= 0 || height <= 0) return whole;

    const projection = projectionFor(width, height);
    const points = places.flatMap((place) => {
        const point = projection([place.longitude, place.latitude]);
        return point ? [point] : [];
    });
    if (points.length === 0) return constrainView(whole, width, height);

    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    const k = clamp(
        Math.min(
            (width - FIT_PADDING * 2) / (right - left),
            (height - FIT_PADDING * 2) / (bottom - top),
        ),
        MIN_SCALE,
        MAX_FIT_SCALE,
    );

    return constrainView(
        {
            k,
            x: width / 2 - (k * (left + right)) / 2,
            y: height / 2 - (k * (top + bottom)) / 2,
        },
        width,
        height,
    );
};
