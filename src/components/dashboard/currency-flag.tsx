"use client";

import { useState } from "react";
import { currencyCountry } from "@/lib/pay";

// A flag fills its box to the edge; a Lucide glyph does not, being a ring of
// radius 10 drawn with a 2-unit stroke inside a 24-unit box, which reaches only
// 22 of those units across. Set to the flags' own 16px it lands a pixel and a
// half short of them and reads as the odd one out, so it is drawn a size up and
// pulled back to the same 16px of layout.
export const CURRENCY_MARK_CLASS = "size-4.5 -m-px shrink-0 text-muted";

// The round mark drawn beside a currency code, wherever one is shown. A flag
// where the money belongs to one country, and a globe everywhere else: the CFA
// francs and the East Caribbean dollar are spent across a dozen countries and
// fly nobody's flag.
//
// The globe also catches a flag that fails to load. The files under public/ are
// written from the currency list this app is built against, and a browser can
// know a currency that list does not: Chrome quotes ZWG where the build does
// not, asks for a flag nobody wrote, and would otherwise draw the broken-image
// box in its place.
export const CurrencyFlag = ({ code }: { code: string }) => {
    const country = currencyCountry(code);
    // Held as the country that failed rather than a flag, so moving to another
    // currency is not read as that one being broken too.
    const [failed, setFailed] = useState<string | null>(null);

    if (!country || failed === country) {
        return (
            <span
                aria-hidden="true"
                className={`icon-[lucide--globe] ${CURRENCY_MARK_CLASS}`}
            />
        );
    }

    return (
        // A few hundred bytes of local SVG each, so image optimisation would add
        // more work than it removes, and `lazy` is what keeps a list of a
        // hundred and fifty of them to the handful actually on screen.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`/flags/${country}.svg`}
            alt=""
            loading="lazy"
            onError={() => setFailed(country)}
            className="size-4 shrink-0"
        />
    );
};
