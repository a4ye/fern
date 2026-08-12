// Writes one SVG per country whose currency the picker offers, out of the icon
// set and into public/, so the browser can ask for the few flags it is actually
// drawing. The set holds 731 flags and the picker reaches 149 of them, and a
// page that never opens the picker should download none of it.
//
// Run with `bun run flags:sync` after changing which currencies are offered.

import { mkdir, rm, writeFile } from "node:fs/promises";
import icons from "@iconify-json/circle-flags/icons.json";
import { CURRENCIES, currencyCountry } from "@/lib/pay";

const OUT = "public/flags";

const countries = [
    ...new Set(
        CURRENCIES.map(currencyCountry).filter(
            (country): country is string => country !== null,
        ),
    ),
].sort();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const country of countries) {
    const icon = icons.icons[country as keyof typeof icons.icons];
    if (!icon) throw new Error(`circle-flags has no flag for "${country}"`);
    const width = icons.width;
    const height = icons.height;
    await writeFile(
        `${OUT}/${country}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`,
    );
}
