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
// The server, and the first client render that has to match it, get the whole
// list; the first read after mount narrows it.
export const useRowWindow = (
    viewRef: RefObject<HTMLElement | null>,
    listRef: RefObject<HTMLElement | null>,
    count: number,
    rowRem: number,
): RowWindow => {
    const whole = useMemo(() => wholeList(count), [count]);
    const held = useRef<RowWindow>(whole);

    // Capture, so the table's own scrolling container is heard through the
    // window. Nothing here holds the element: it is torn down and rebuilt every
    // time the table empties and refills, and a listener bound to the old one
    // would leave the window frozen where it last stood.
    const subscribe = useCallback((onChange: () => void) => {
        window.addEventListener("scroll", onChange, true);
        window.addEventListener("resize", onChange);
        return () => {
            window.removeEventListener("scroll", onChange, true);
            window.removeEventListener("resize", onChange);
        };
    }, []);

    const read = useCallback((): RowWindow => {
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
        return held.current;
    }, [viewRef, listRef, count, rowRem]);

    const readServer = useCallback(() => whole, [whole]);

    return useSyncExternalStore(subscribe, read, readServer);
};
