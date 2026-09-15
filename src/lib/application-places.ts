import type { Place } from "@/components/dashboard/data";
import {
    placeForLocation,
    resolveComprehensiveLocation,
} from "@/lib/job-import/location-server";

// Server only: the resolver behind this reads the worldwide city index.
//
// Locations are stored as whatever the user typed, so the same city arrives
// spelled several ways. Counting the raw text first means a list of hundreds
// resolves only its handful of distinct spellings, and the ones that agree on a
// city then merge under its canonical name.
export const placesFrom = (locations: readonly (string | null)[]): Place[] => {
    const counts = new Map<string, number>();
    for (const location of locations) {
        const raw = location?.trim();
        if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }

    const places = new Map<string, Place>();
    for (const [raw, count] of counts) {
        const resolution = resolveComprehensiveLocation(raw);
        if (resolution.status !== "matched") continue;
        const found = placeForLocation(resolution.location);
        if (!found) continue;

        const placed = places.get(resolution.location);
        if (placed) {
            placed.count += count;
            continue;
        }
        places.set(resolution.location, {
            label: resolution.location,
            city: resolution.location.split(",")[0],
            region: found.region,
            country: found.country,
            latitude: found.latitude,
            longitude: found.longitude,
            count,
        });
    }

    return [...places.values()].sort(
        (left, right) =>
            right.count - left.count ||
            left.label.localeCompare(right.label, "en"),
    );
};
