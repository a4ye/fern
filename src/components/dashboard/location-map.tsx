"use client";

import { Zoom } from "@visx/zoom";
import { geoBounds, geoPath, type GeoProjection } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import {
    detailCellsFor,
    detailEdgePath,
    detailBorderPath,
    detailFillPath,
    detailWaterPath,
    isCellLoaded,
    loadDetailCells,
    loadedCell,
    loadedCellKeys,
    placementFor,
    readyDetailFor,
    type DetailCell,
    type DetailView,
    type Placement,
} from "@/components/dashboard/location-map-detail";
import { ChartTip } from "@/components/dashboard/chart-theme";
import {
    countNames,
    countriesNamed,
    MAP_HEIGHT,
    mergeNames,
    regionNameFrom,
} from "@/components/dashboard/location-map-panel";
import {
    boundsOnPanel,
    CLUSTER_EXTENT,
    CLUSTER_RADIUS,
    clusterZoomFor,
    heldView,
    fitViewFor,
    MAX_CLUSTER_ZOOM,
    MAX_SCALE,
    MIN_SCALE,
    projectionFor,
    radiusFor,
    scaleForClusterZoom,
    viewProjectionFor,
} from "@/components/dashboard/location-map-data";
import type { Place } from "@/components/dashboard/data";

const countries = feature(
    world as unknown as Topology,
    (world as unknown as Topology).objects.countries,
) as FeatureCollection<Geometry>;

// Every country is streamed through the projection to build the coarse path,
// however little of the world the panel shows, and there are getting on for two
// hundred of them. Zoomed in, three of them fill the panel. The box around each
// one is worked out the once, so a frame can leave out what it cannot show.
const outlines = countries.features.map((shape) => ({
    shape,
    bounds: geoBounds(shape),
}));

const coarsePathFor = (
    projection: GeoProjection,
    width: number,
    height: number,
): string =>
    geoPath(projection)({
        type: "FeatureCollection",
        features: outlines
            .filter(({ bounds }) =>
                boundsOnPanel(bounds, projection, width, height),
            )
            .map(({ shape }) => shape),
    }) ?? "";

type PlaceProperties = {
    label: string;
    region: string;
    country: string;
    count: number;
};

// Carried through the merge so a group can name the ground it covers. A field
// is emptied as soon as two members disagree, which leaves whatever they still
// share: the province while a group stays inside one, then the country, then
// nothing once it spans two.
type ClusterTotal = {
    applications: number;
    region: string;
    country: string;
    countries: string;
};

type Marker = {
    key: string;
    clusterId: number | null;
    title: string;
    detail: string;
    count: number;
    x: number;
    y: number;
    longitude: number;
    latitude: number;
};

const applicationsIn = (count: number): string =>
    `${count} ${count === 1 ? "application" : "applications"}`;

// The panel is fluid, and the projection needs a number. Measuring beats a
// guess: the map is inside a grid that changes shape at every breakpoint.
const useWidth = (): [React.RefObject<HTMLDivElement | null>, number] => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new ResizeObserver(([entry]) => {
            setWidth(entry.contentRect.width);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return [ref, width];
};

// Circles are drawn at a fixed size whatever the zoom, since their size means
// a count rather than an area on the ground.
const markersAt = (
    index: Supercluster<PlaceProperties, ClusterTotal>,
    projection: GeoProjection,
    zoom: number,
): Marker[] =>
    index
        .getClusters([-180, -85, 180, 85], zoom)
        .flatMap<Marker>((entry) => {
            const [longitude, latitude] = entry.geometry.coordinates;
            const point = projection([longitude, latitude]);
            if (!point) return [];

            const at = {
                x: point[0],
                y: point[1],
                longitude,
                latitude,
            };
            const properties = entry.properties;

            if ("cluster" in properties) {
                const ground = regionNameFrom(
                    properties.region,
                    properties.country,
                );
                const cities = `${properties.point_count} cities`;
                return [
                    {
                        key: `cluster-${properties.cluster_id}`,
                        clusterId: properties.cluster_id,
                        title:
                            ground ||
                            countriesNamed(countNames(properties.countries)),
                        detail: `${cities}, ${applicationsIn(properties.applications)}`,
                        count: properties.applications,
                        ...at,
                    },
                ];
            }
            return [
                {
                    key: properties.label,
                    clusterId: null,
                    title: properties.label,
                    detail: applicationsIn(properties.count),
                    count: properties.count,
                    ...at,
                },
            ];
        });

// Clustering keeps its groups a radius apart in its own coordinates, but a
// group sits at the mean of everything it holds, and absorbing one more member
// drags that mean towards the group next door. Two can end up near enough to
// draw over each other, which reads as one place drawn twice rather than as two
// places. Asking a level coarser merges them, and level zero is a single group,
// so stepping down always ends.
const overlapping = (markers: readonly Marker[], busiest: number): boolean =>
    markers.some((first, at) =>
        markers
            .slice(at + 1)
            .some(
                (second) =>
                    Math.hypot(first.x - second.x, first.y - second.y) <
                    radiusFor(first.count, busiest) +
                        radiusFor(second.count, busiest),
            ),
    );

const markersFrom = (
    index: Supercluster<PlaceProperties, ClusterTotal>,
    projection: GeoProjection,
    busiest: number,
): Marker[] => {
    const wanted = clusterZoomFor(projection.scale());
    for (let zoom = wanted; zoom > 0; zoom -= 1) {
        const markers = markersAt(index, projection, zoom);
        if (!overlapping(markers, busiest)) return markers;
    }
    return markersAt(index, projection, 0);
};

// Half a plate's worth of room, so hovering a city against either edge does
// not hang the tooltip outside the panel.
const TIP_EDGE = 90;

const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), Math.max(low, high));

// One level's worth of ground: land, the lakes over it, borders, and the
// outline around it all, drawn from the same cells so they cannot disagree.
//
// Each cell fills through its own path rather than all of them through one.
// Neighbours are cut to overlap, and a single path resolves overlaps by winding
// number: where two rings ran opposite ways they cancelled and punched a hole in
// the land, a bare band along the shared edge tens of pixels wide at close zoom.
// Separate paths simply paint the same colour twice.
const DetailLayer = ({
    cells,
    at,
}: {
    cells: DetailCell[];
    at: Placement;
}) => (
    <>
        {cells.map((cell) => (
            <path
                key={`land-${cell.key}`}
                d={detailFillPath([cell], at)}
                fill="var(--color-background)"
            />
        ))}
        {/* Every lake goes over every cell's land, since the country shapes
            underneath hold no water and a lake can span a cell boundary. */}
        {cells.map((cell) => (
            <path
                key={`water-${cell.key}`}
                d={detailWaterPath([cell], at)}
                fill="var(--color-surface)"
            />
        ))}
        {/* Dashed, as a border inside a country conventionally is, so it never
            reads as a coastline. Strokes carry no winding, so they can share. */}
        <path
            d={detailBorderPath(cells, at)}
            fill="none"
            stroke="var(--color-muted)"
            strokeOpacity={0.5}
            strokeWidth={0.75}
            strokeDasharray="3 3"
        />
        <path
            d={detailEdgePath(cells, at)}
            fill="none"
            stroke="var(--color-tile-border)"
            strokeWidth={1}
        />
    </>
);

const ZOOM_BUTTON =
    "flex size-7 cursor-pointer items-center justify-center border border-hairline bg-background text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const LocationMap = ({ places }: { places: Place[] }) => {
    const [ref, width] = useWidth();
    const [hovered, setHovered] = useState<string | null>(null);
    const [ready, setReady] = useState<ReadonlySet<string>>(new Set());

    const projection = useMemo(() => projectionFor(width, MAP_HEIGHT), [width]);
    const initial = useMemo(
        () => fitViewFor(places, width, MAP_HEIGHT),
        [places, width],
    );

    const index = useMemo(() => {
        const clusters = new Supercluster<PlaceProperties, ClusterTotal>({
            radius: CLUSTER_RADIUS,
            extent: CLUSTER_EXTENT,
            maxZoom: MAX_CLUSTER_ZOOM,
            map: (properties) => ({
                applications: properties.count,
                region: properties.region,
                country: properties.country,
                countries: properties.country,
            }),
            reduce: (total, properties) => {
                total.applications += properties.applications;
                if (total.region !== properties.region) total.region = "";
                if (total.country !== properties.country) total.country = "";
                total.countries = mergeNames(
                    total.countries,
                    properties.countries,
                );
            },
        });
        clusters.load(
            places.map((place) => ({
                type: "Feature" as const,
                properties: {
                    label: place.label,
                    region: place.region,
                    country: place.country,
                    count: place.count,
                },
                geometry: {
                    type: "Point" as const,
                    coordinates: [place.longitude, place.latitude],
                },
            })),
        );
        return clusters;
    }, [places]);

    // Every circle is measured against the busiest single city, so a place keeps
    // the same size whatever the zoom, and a merged group grows past it by as
    // much as it actually holds.
    const busiest = places[0]?.count ?? 0;

    return (
        <>
            {places.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    No applications name a place yet.
                </p>
            ) : (
                <div
                    ref={ref}
                    style={{ height: MAP_HEIGHT }}
                    className="relative"
                >
                    {width > 0 && (
                        <Zoom<SVGSVGElement>
                            width={width}
                            height={MAP_HEIGHT}
                            scaleXMin={MIN_SCALE}
                            scaleXMax={MAX_SCALE}
                            scaleYMin={MIN_SCALE}
                            scaleYMax={MAX_SCALE}
                            constrain={(matrix, previous) => {
                                const held = heldView(
                                    {
                                        k: matrix.scaleX,
                                        x: matrix.translateX,
                                        y: matrix.translateY,
                                    },
                                    {
                                        k: previous.scaleX,
                                        x: previous.translateX,
                                        y: previous.translateY,
                                    },
                                    width,
                                    MAP_HEIGHT,
                                );
                                return {
                                    ...matrix,
                                    scaleX: held.k,
                                    scaleY: held.k,
                                    translateX: held.x,
                                    translateY: held.y,
                                };
                            }}
                            initialTransformMatrix={{
                                scaleX: initial.k,
                                scaleY: initial.k,
                                translateX: initial.x,
                                translateY: initial.y,
                                skewX: 0,
                                skewY: 0,
                            }}
                        >
                            {(zoom) => {
                                const {
                                    scaleX: k,
                                    translateX,
                                    translateY,
                                } = zoom.transformMatrix;
                                const drawn = viewProjectionFor(
                                    width,
                                    MAP_HEIGHT,
                                    { k, x: translateX, y: translateY },
                                );
                                const markers = markersFrom(
                                    index,
                                    drawn,
                                    busiest,
                                );

                                // The coarse outlines carry the whole world but
                                // hold no coastline worth the name from a city,
                                // where they leave the panel blank. Detail is
                                // fetched a cell at a time for the ground in
                                // view, and from a finer level the closer the
                                // zoom gets, so a close look costs kilobytes
                                // rather than the megabytes a whole set would.
                                const wanted = detailCellsFor(
                                    drawn,
                                    width,
                                    MAP_HEIGHT,
                                    k,
                                );
                                if (wanted) {
                                    void loadDetailCells(
                                        wanted.level,
                                        wanted.keys,
                                    ).then(
                                        (arrived) =>
                                            arrived &&
                                            setReady(loadedCellKeys()),
                                    );
                                }

                                const shown = readyDetailFor(
                                    drawn,
                                    width,
                                    MAP_HEIGHT,
                                    k,
                                    (level, key) =>
                                        isCellLoaded(ready, level, key),
                                );
                                const cellsOf = (view: DetailView) =>
                                    view?.keys.flatMap(
                                        (key) =>
                                            loadedCell(view.level, key) ?? [],
                                    ) ?? [];
                                const detail = cellsOf(shown);

                                // The two disagree, and the coarse one is
                                // wrong: its straight coastline paints the bay
                                // as land. They cross-fade rather than swap, so
                                // the first cells to arrive dissolve in.
                                const covered = shown !== null;

                                const tip =
                                    markers.find(
                                        (marker) => marker.key === hovered,
                                    ) ?? null;

                                const openCluster = (marker: Marker) => {
                                    if (marker.clusterId === null) return;
                                    const target = scaleForClusterZoom(
                                        projection.scale(),
                                        index.getClusterExpansionZoom(
                                            marker.clusterId,
                                        ),
                                    );
                                    const point = projection([
                                        marker.longitude,
                                        marker.latitude,
                                    ]);
                                    if (!point) return;

                                    setHovered(null);
                                    zoom.setTransformMatrix({
                                        scaleX: target,
                                        scaleY: target,
                                        translateX:
                                            width / 2 - target * point[0],
                                        translateY:
                                            MAP_HEIGHT / 2 - target * point[1],
                                        skewX: 0,
                                        skewY: 0,
                                    });
                                };

                                return (
                                    <>
                                        <svg
                                            ref={zoom.containerRef}
                                            width={width}
                                            height={MAP_HEIGHT}
                                            role="img"
                                            aria-label={`Applications by city. ${places
                                                .slice(0, 5)
                                                .map(
                                                    (place) =>
                                                        `${place.city}, ${applicationsIn(place.count)}`,
                                                )
                                                .join(". ")}.`}
                                            onWheel={() => setHovered(null)}
                                            onPointerDown={(event) => {
                                                setHovered(null);
                                                zoom.dragStart(event);
                                            }}
                                            onPointerMove={zoom.dragMove}
                                            onPointerUp={zoom.dragEnd}
                                            className={`touch-none block bg-surface ${zoom.isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                                        >
                                            {/* One layer at a time, faded in
                                                as a whole. Two overlaid never
                                                worked: a fill at part opacity
                                                cannot cover the fill beneath
                                                it, so one level's outline sat
                                                over another level's land. */}
                                            <g
                                                key={
                                                    covered
                                                        ? shown?.level.name
                                                        : "coarse"
                                                }
                                                className="animate-[map-detail-in_300ms_ease-out]"
                                            >
                                                {covered ? (
                                                    <DetailLayer
                                                        cells={detail}
                                                        at={placementFor(
                                                            drawn,
                                                            width,
                                                            MAP_HEIGHT,
                                                        )}
                                                    />
                                                ) : (
                                                    <path
                                                        d={coarsePathFor(
                                                            drawn,
                                                            width,
                                                            MAP_HEIGHT,
                                                        )}
                                                        fill="var(--color-background)"
                                                        stroke="var(--color-tile-border)"
                                                        strokeWidth={1}
                                                    />
                                                )}
                                            </g>
                                            <g>
                                                {markers.map((marker) => (
                                                    <circle
                                                        key={marker.key}
                                                        cx={marker.x}
                                                        cy={marker.y}
                                                        r={radiusFor(
                                                            marker.count,
                                                            busiest,
                                                        )}
                                                        fill="var(--color-accent)"
                                                        fillOpacity={0.55}
                                                        stroke="var(--color-accent-deep)"
                                                        strokeWidth={1}
                                                        onClick={() =>
                                                            openCluster(marker)
                                                        }
                                                        onMouseEnter={() =>
                                                            setHovered(
                                                                marker.key,
                                                            )
                                                        }
                                                        onMouseLeave={() =>
                                                            setHovered(null)
                                                        }
                                                        className={
                                                            marker.clusterId ===
                                                            null
                                                                ? ""
                                                                : "cursor-pointer"
                                                        }
                                                    />
                                                ))}
                                            </g>
                                        </svg>
                                        <div className="absolute top-2 right-2 flex flex-col gap-1">
                                            <button
                                                type="button"
                                                aria-label="Zoom in"
                                                onClick={() =>
                                                    zoom.scale({
                                                        scaleX: 2,
                                                        scaleY: 2,
                                                    })
                                                }
                                                className={ZOOM_BUTTON}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--plus] size-4"
                                                />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Zoom out"
                                                onClick={() =>
                                                    zoom.scale({
                                                        scaleX: 0.5,
                                                        scaleY: 0.5,
                                                    })
                                                }
                                                className={ZOOM_BUTTON}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--minus] size-4"
                                                />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Reset the view"
                                                onClick={() => {
                                                    setHovered(null);
                                                    zoom.reset();
                                                }}
                                                className={ZOOM_BUTTON}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--rotate-ccw] size-3.5"
                                                />
                                            </button>
                                        </div>
                                        {tip && (
                                            <div
                                                role="tooltip"
                                                style={{
                                                    left: clamp(
                                                        tip.x,
                                                        TIP_EDGE,
                                                        width - TIP_EDGE,
                                                    ),
                                                    top: tip.y,
                                                    transform:
                                                        "translate(-50%, calc(-100% - 10px))",
                                                }}
                                                className="pointer-events-none absolute z-50"
                                            >
                                                <ChartTip
                                                    name={tip.title}
                                                    detail={tip.detail}
                                                />
                                            </div>
                                        )}
                                    </>
                                );
                            }}
                        </Zoom>
                    )}
                </div>
            )}
        </>
    );
};
