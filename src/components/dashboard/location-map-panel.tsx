import type { ReactNode } from "react";
import type { Place } from "@/components/dashboard/data";

// The map itself arrives late, since its country outlines are worth more than
// the rest of the panel put together and nobody who leaves insights closed
// should pay for them. Its frame is kept here so the placeholder holding the
// space is the same box, down to the pixel, as the map that replaces it. That
// also keeps d3 out of the frame's own module, and so out of the first load.
export const MAP_HEIGHT = 380;

// "Ontario, Canada", but plain "Singapore" where the region only repeats the
// country, as it does for a city state.
export const regionNameFrom = (region: string, country: string): string =>
    !region || region === country ? country : `${region}, ${country}`;

// A merged group that spans two countries can still say which ones it covers,
// but only if it counted them on the way up. Clustering rebuilds a group's
// properties from its parts over and over, and a Set does not survive that
// copying, so the names ride along as sorted joined text. The separator has
// to be one that no country name can contain, which rules out a space.
const NAME_JOIN = "\u0000";

export const mergeNames = (left: string, right: string): string =>
    [...new Set([...left.split(NAME_JOIN), ...right.split(NAME_JOIN)])]
        .filter(Boolean)
        .sort((first, second) => first.localeCompare(second, "en"))
        .join(NAME_JOIN);

export const countNames = (names: string): number =>
    names ? names.split(NAME_JOIN).length : 0;

export const countriesNamed = (count: number): string =>
    `${count} ${count === 1 ? "country" : "countries"}`;

// "12 cities" alone says nothing a glance at the map does not. Naming the
// country answers the question the panel is actually asked, which is where the
// applications went rather than how many pins there are.
export const summaryFrom = (places: readonly Place[]): string => {
    if (places.length === 0) return "";

    const cities = `${places.length} ${places.length === 1 ? "city" : "cities"}`;
    const countries = new Set(places.map((place) => place.country));
    const [only] = [...countries];
    if (countries.size === 1) {
        return places.length === 1 ? only : `${cities} in ${only}`;
    }
    return `${cities} in ${countriesNamed(countries.size)}`;
};

export const LocationMapPanel = ({
    places,
    children,
}: {
    places: Place[];
    children: ReactNode;
}) => (
    <section className="min-w-0 border border-hairline bg-background">
        <div className="flex min-h-10 items-center justify-between gap-4 border-b border-hairline px-4 py-2">
            <h2 className="text-xs font-medium text-muted">
                Where you applied
            </h2>
            <span className="text-xs text-muted tabular-nums">
                {summaryFrom(places)}
            </span>
        </div>
        {children}
    </section>
);
