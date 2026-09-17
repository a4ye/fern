import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";

const WIDTH = 1000;
const VIEW = { west: -130, east: 22, south: 23, north: 61 };

// The two corners rather than the ring between them: a ring wound the wrong way
// round is the rest of the globe to a spherical projection, and the frame would
// come back as the whole world.
const VIEW_SHAPE = {
    type: "MultiPoint" as const,
    coordinates: [
        [VIEW.west, VIEW.south],
        [VIEW.east, VIEW.north],
    ],
};

const CITIES: {
    name: string;
    at: [number, number];
    count: number;
    // A plate is centred on its city unless that would take it off the frame.
    label?: "centre" | "right";
}[] = [
    { name: "Vancouver", at: [-123.12, 49.28], count: 2 },
    { name: "Seattle", at: [-122.33, 47.61], count: 4 },
    { name: "San Francisco", at: [-122.42, 37.77], count: 6, label: "right" },
    { name: "Austin", at: [-97.74, 30.27], count: 2 },
    { name: "Chicago", at: [-87.63, 41.88], count: 3 },
    { name: "Toronto", at: [-79.38, 43.65], count: 12, label: "centre" },
    { name: "New York", at: [-74.01, 40.71], count: 5 },
    { name: "Boston", at: [-71.06, 42.36], count: 3 },
    { name: "London", at: [-0.13, 51.51], count: 3, label: "centre" },
    { name: "Berlin", at: [13.4, 52.52], count: 1 },
];

const projection = geoMercator().fitWidth(WIDTH, VIEW_SHAPE);
const path = geoPath(projection);

const project = (at: [number, number]): [number, number] =>
    path.centroid({ type: "Point", coordinates: at });

const TOP = project([0, VIEW.north])[1];
const HEIGHT = project([0, VIEW.south])[1] - TOP;

// Everything outside the frame is dropped by the projection rather than by the
// viewBox, so the markup carries the coastline it shows and no more. The clip
// sits just outside the frame, which keeps the seam where a clipped country is
// closed off the visible edge.
projection.clipExtent([
    [-2, TOP - 2],
    [WIDTH + 2, TOP + HEIGHT + 2],
]);

const countries = feature(
    world as unknown as Topology,
    (world as unknown as Topology).objects.countries,
) as FeatureCollection<Geometry>;

// The map is built a thousand units wide and never drawn much wider than that,
// so the fraction of a unit each point carries stays under a pixel on screen.
// Dropping the fractions takes the coastline from 32kB of markup to 13kB.
const LAND = (path(countries) ?? "").replace(/\.\d+/g, "");

const marks = CITIES.map((city) => {
    const [x, y] = project(city.at);
    return {
        ...city,
        x,
        y,
        radius: 3 + Math.sqrt(city.count) * 2.2,
        left: `${(x / WIDTH) * 100}%`,
        top: `${((y - TOP) / HEIGHT) * 100}%`,
    };
});

export const AppliedMap = () => (
    <div aria-hidden="true" className="relative">
        <svg
            viewBox={`0 ${TOP} ${WIDTH} ${HEIGHT}`}
            className="w-full border border-hairline"
        >
            <rect
                x="0"
                y={TOP}
                width={WIDTH}
                height={HEIGHT}
                fill="var(--color-background)"
            />
            <path
                d={LAND}
                fill="var(--color-surface)"
                stroke="var(--color-tile-border)"
                strokeWidth={0.6}
            />
            {marks.map((mark, index) => (
                <circle
                    key={mark.name}
                    cx={mark.x}
                    cy={mark.y}
                    r={mark.radius}
                    fill="var(--color-accent)"
                    stroke="var(--color-accent-deep)"
                    strokeWidth={0.6}
                    style={{ animationDelay: `${index * 400}ms` }}
                    className="map-dot"
                />
            ))}
        </svg>

        {marks
            .filter((mark) => mark.label)
            .map((mark) => (
                <span
                    key={mark.name}
                    style={{ left: mark.left, top: mark.top }}
                    className={`absolute hidden -translate-y-full flex-col sm:flex ${
                        mark.label === "right"
                            ? "items-start"
                            : "-translate-x-1/2 items-center"
                    }`}
                >
                    <span className="flex items-center gap-2 border border-hairline bg-background px-2 py-1 text-xs whitespace-nowrap">
                        <span className="font-medium">{mark.name}</span>
                        <span className="text-muted">{mark.count}</span>
                    </span>
                    <span className="h-2 w-px bg-tile-border" />
                </span>
            ))}
    </div>
);
