"use client";

import {
    useCallback,
    useMemo,
    useRef,
    useSyncExternalStore,
    type RefObject,
} from "react";

// Under this many rows the table is drawn whole. A short list costs nothing to
// draw in full, and drawing it whole keeps the browser's own find-in-page
// working, which windowing necessarily breaks: what is not in the document
// cannot be found.
const WHOLE_BELOW = 200;

// Rows drawn past each edge, so a flick of the wheel lands on rows that are
// already there rather than on the space left for them.
const OVERSCAN = 8;

// Which rows to draw, and how many rows' worth of empty space stands in for the
// ones left out. The padding is counted in rows rather than pixels so the
// spacers can be sized in the same rem the rows are.
export type RowWindow = {
    start: number;
    end: number;
    padTop: number;
    padBottom: number;
};

const wholeList = (count: number): RowWindow => ({
    start: 0,
    end: count,
    padTop: 0,
    padBottom: 0,
});

// `scrolled` is how far the top of the list has travelled above the top of the
// viewport, and is negative while the list has yet to reach it.
export const windowFor = (
    scrolled: number,
    viewport: number,
    rowHeight: number,
    count: number,
): RowWindow => {
    if (count <= WHOLE_BELOW || rowHeight <= 0) return wholeList(count);

    const first = Math.floor(Math.max(0, scrolled) / rowHeight);
    const start = Math.max(0, first - OVERSCAN);
    const end = Math.min(
        count,
        first + Math.ceil(viewport / rowHeight) + OVERSCAN,
    );

    return { start, end, padTop: start, padBottom: count - end };
};

// What to draw before anything can be measured: on the server, and on the
// first client render, which has to match the server's or hydration fails.
//
// Handing back the whole list here is what this used to do, and it cost a
// 1,100-row list 180ms of render and 800KB of HTML on the server and then the
// same work again, plus fourteen thousand nodes, to hydrate it. Every row past
// the first screenful was thrown away by the first measurement anyway.
//
// Guessed high on purpose. The table is capped at 70vh, which is 1512px on a
// screen 2160 tall, and a guess that came up short of the screen would leave a
// gap under the last row until the measurement landed. Guessing over only
// costs the rows between, and forty-eight of them render in 6ms.
const GUESS_VIEWPORT = 1600;

// The root font size cannot be read on the server, so the browser's default
// stands in. It only has to be close enough to cover the screen.
const GUESS_ROOT_PX = 16;

export const firstGuess = (count: number, rowRem: number): RowWindow =>
    windowFor(0, GUESS_VIEWPORT, rowRem * GUESS_ROOT_PX, count);

const same = (one: RowWindow, two: RowWindow): boolean =>
    one.start === two.start &&
    one.end === two.end &&
    one.padTop === two.padTop &&
    one.padBottom === two.padBottom;

// Draws only the rows on screen. Everything the table knows stays in the array
// it was handed, so sorting, filtering, selection and open drafts are untouched:
// this decides what the document holds, not what the list is.
//
// Written as an external store rather than an effect that measures and then
// sets state, because that is what this is: the scroll offset lives in the DOM,
// React subscribes to it, and the window is read back rather than mirrored.
// The server, and the first client render that has to match it, get a screen's
// worth guessed at a laptop's height; the first read after mount measures the
// real one. See firstGuess.
export const useRowWindow = (
    viewRef: RefObject<HTMLElement | null>,
    listRef: RefObject<HTMLElement | null>,
    count: number,
    rowRem: number,
): RowWindow => {
    const guess = useMemo(() => firstGuess(count, rowRem), [count, rowRem]);
    const held = useRef<RowWindow>(guess);
    // The row count the held window was measured for, or -1 before anything
    // has been measured. React reads a snapshot on every render and again
    // after every commit, and reading this one measures, so leaving it out
    // would force the browser to flush style and layout twice over for a
    // redraw that cannot have moved the scroll. Ticking a box, opening the
    // editor, printing an error: none of those are grounds to ask the browser
    // anything. Only the scroll and resize this store listens for, and a
    // change in how many rows there are, can make the last answer stale.
    const measuredFor = useRef(-1);

    // Capture, so the table's own scrolling container is heard through the
    // window. Nothing here holds the element: it is torn down and rebuilt every
    // time the table empties and refills, and a listener bound to the old one
    // would leave the window frozen where it last stood.
    const subscribe = useCallback((onChange: () => void) => {
        const moved = () => {
            measuredFor.current = -1;
            onChange();
        };
        window.addEventListener("scroll", moved, true);
        window.addEventListener("resize", moved);
        return () => {
            window.removeEventListener("scroll", moved, true);
            window.removeEventListener("resize", moved);
        };
    }, []);

    const read = useCallback((): RowWindow => {
        if (measuredFor.current === count) return held.current;
        const view = viewRef.current;
        const list = listRef.current;
        // The row height is written in rem, so the root font size is what turns
        // it into the pixels a scroll is counted in.
        const rowHeight =
            rowRem *
            parseFloat(getComputedStyle(document.documentElement).fontSize);
        const next =
            view && list
                ? windowFor(
                      // Taken from the rectangles rather than from scrollTop,
                      // which counts the sticky header the list sits below.
                      view.getBoundingClientRect().top -
                          list.getBoundingClientRect().top,
                      view.clientHeight,
                      rowHeight,
                      count,
                  )
                : // Nothing to measure yet. The container is torn down whenever
                  // a filter matches nothing and built afresh at the top when
                  // one matches again, so the first screenful is the right
                  // guess, and a viewport's worth is a generous one. Handing
                  // back the whole list here would draw every row for a frame
                  // on an ordinary clearing of the search box.
                  windowFor(0, window.innerHeight, rowHeight, count);
        // A snapshot is compared by identity, so an unchanged window has to come
        // back as the very same object or the read never settles.
        if (!same(held.current, next)) held.current = next;
        measuredFor.current = count;
        return held.current;
    }, [viewRef, listRef, count, rowRem]);

    const readServer = useCallback(() => guess, [guess]);

    return useSyncExternalStore(subscribe, read, readServer);
};
