"use client";

import {
    useCallback,
    useEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from "react";

// How close to an edge of the scrolling box the pointer has to come before the
// table starts to travel under it, and the fastest it then goes. A drag that
// reaches the fold has more rows to cover than fit on screen, so the rest of
// the list has to come to the pointer.
const EDGE_PX = 56;
const SPEED_PX = 16;

// Which row sits under the pointer, counted from the top of the list rather
// than read off the node under it. Rows outside the drawn window are not in the
// document at all, and a drag has to reach them anyway; every row is the same
// height, so the arithmetic answers for a row whether it was drawn or not.
// Clamped at both ends, so a pointer dragged past the last row paints to the
// end and stops there.
export const rowAt = (
    y: number,
    listTop: number,
    rowHeight: number,
    count: number,
): number => {
    if (rowHeight <= 0 || count === 0) return 0;
    const index = Math.floor((y - listTop) / rowHeight);
    return Math.min(count - 1, Math.max(0, index));
};

// Pixels to scroll this frame: none through the middle of the box, rising to
// SPEED_PX at either edge. The zones are capped at a quarter of the box each so
// a short table keeps a dead middle, and a drag can always come to rest.
export const edgeScroll = (y: number, top: number, bottom: number): number => {
    const edge = Math.min(EDGE_PX, (bottom - top) / 4);
    if (edge <= 0) return 0;
    if (y < top + edge) {
        return -Math.min(1, (top + edge - y) / edge) * SPEED_PX;
    }
    if (y > bottom - edge) {
        return Math.min(1, (y - bottom + edge) / edge) * SPEED_PX;
    }
    return 0;
};

type Drag = {
    from: number;
    to: number;
    // A drag fills the run it crosses. Letting the row under the press decide
    // instead reads well written down and badly in the hand: the row you reach
    // for to carry a selection onwards is the one you just ticked, and a drag
    // from there would have thrown it away. Clearing a run is the held key.
    selecting: boolean;
    y: number;
    painted: boolean;
    // Measured once, when the press lands. Reading it per frame means asking
    // for the root's computed style and the list's box on every one of them,
    // and each of those answers forces the layout the render before it just
    // dirtied. A drag cannot change the font size it began under.
    rowHeight: number;
};

// Press a row's tick box, drag across the rows, release. The run under the drag
// takes the state the press decided, and shrinking the drag back gives up the
// rows it leaves behind, which only works because every frame is applied to the
// selection as it stood when the press landed rather than to the last frame.
// That snapshot is the caller's to hold: `onPaint` is handed the whole run each
// time, not the difference.
//
// A drag holds nothing in state, and the listeners are laid by the press rather
// than by an effect watching a flag. Routing it through state would redraw the
// whole table twice for every tick of a box, which is a table's worth of work
// for a press that may not turn out to be a drag at all.
export const useDragSelect = ({
    scrollRef,
    listRef,
    rowRem,
    count,
    onPaint,
    onSettle,
}: {
    scrollRef: RefObject<HTMLElement | null>;
    listRef: RefObject<HTMLElement | null>;
    rowRem: number;
    count: number;
    onPaint: (from: number, to: number, selecting: boolean) => void;
    onSettle: (index: number) => void;
}) => {
    const drag = useRef<Drag | null>(null);
    // Gives up the listeners a press laid. Held so a press that somehow lands
    // while a drag is still live, and an unmount in the middle of one, can both
    // put the window back the way they found it.
    const release = useRef<(() => void) | null>(null);

    // Read through a ref because the listeners below outlive the render that
    // bound them, and the rows they paint are the ones showing now.
    const latest = useRef({ count, onPaint, onSettle });
    useEffect(() => {
        latest.current = { count, onPaint, onSettle };
    });

    // Measured here, away from the press. A row's height is written in rem, so
    // the root font size is what turns it into the pixels a pointer is
    // reported in, and asking for a computed style makes the browser bring all
    // pending style work up to date before it answers. Doing that inside a
    // pointer handler charges every press for whatever the pointer dirtied on
    // its way across the table, which on a table of rows that light up under
    // the cursor is all of them. Only a resize can change the answer.
    const rowPx = useRef(0);
    useEffect(() => {
        const measure = () => {
            rowPx.current =
                rowRem *
                parseFloat(getComputedStyle(document.documentElement).fontSize);
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [rowRem]);

    const paint = useCallback(() => {
        const state = drag.current;
        const list = listRef.current;
        if (!state || !list) return;
        const to = rowAt(
            state.y,
            list.getBoundingClientRect().top,
            state.rowHeight,
            latest.current.count,
        );
        if (to === state.to) return;
        state.to = to;
        state.painted = true;
        latest.current.onPaint(state.from, to, state.selecting);
    }, [listRef]);

    const start = useCallback(
        (event: ReactPointerEvent, index: number, selecting: boolean) => {
            // The main button only, and never a held shift: that press is a
            // range of its own and must not also arm a drag.
            if (event.button !== 0 || event.shiftKey) return;
            release.current?.();
            drag.current = {
                from: index,
                to: index,
                selecting,
                y: event.clientY,
                painted: false,
                rowHeight: rowPx.current,
            };

            // Held off the whole document for as long as the drag lasts, so a
            // pointer carried down the rows does not take their text with it.
            // Written straight to the element: routing it through state would
            // redraw the table twice for every press, drag or not.
            const body = document.body.style;
            const userSelectWas = body.userSelect;
            body.userSelect = "none";

            let frame = 0;

            const off = () => {
                drag.current = null;
                release.current = null;
                body.userSelect = userSelectWas;
                cancelAnimationFrame(frame);
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", stop);
                window.removeEventListener("pointercancel", stop);
            };

            function onMove(moved: PointerEvent) {
                if (!drag.current) return;
                // A press let go outside the window sends no release in. The
                // first move back inside reports no button held, which is the
                // only word of it we get.
                if (moved.buttons === 0) {
                    stop();
                    return;
                }
                drag.current.y = moved.clientY;
                paint();
                // The list only has to travel while the pointer is held
                // against an edge, so a move into one starts the loop below
                // and a drag through the middle of the table never pays for
                // it at all.
                if (!frame) frame = requestAnimationFrame(step);
            }

            function stop() {
                const state = drag.current;
                off();
                if (!state) return;
                latest.current.onSettle(state.to);
                if (!state.painted) return;
                // The press that began the drag still ends in a click on the
                // box it started from, and that click would undo the first row
                // the drag painted.
                const swallow = (click: MouseEvent) => {
                    click.preventDefault();
                    click.stopPropagation();
                };
                window.addEventListener("click", swallow, {
                    capture: true,
                    once: true,
                });
                // A release outside the window never produces that click, and
                // a listener left armed would eat whatever was pressed next.
                // The click lands in the same task as the release, so a timer
                // set here runs after it either way.
                setTimeout(() =>
                    window.removeEventListener("click", swallow, {
                        capture: true,
                    }),
                );
            }

            // While the pointer is held against an edge it stops sending
            // moves, and the rows still have to keep coming to it, so the
            // travelling is done here instead. The loop gives itself up the
            // moment a frame finds nothing to scroll: every turn of it reads
            // the box back out of the layout, which is not a thing to be doing
            // sixty times a second for a pointer sitting in the middle of the
            // table.
            function step() {
                const state = drag.current;
                const box = scrollRef.current;
                frame = 0;
                if (!state || !box) return;
                const rect = box.getBoundingClientRect();
                const by = edgeScroll(state.y, rect.top, rect.bottom);
                if (by === 0) return;
                box.scrollTop += by;
                paint();
                frame = requestAnimationFrame(step);
            }

            release.current = off;
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", stop);
            window.addEventListener("pointercancel", stop);
        },
        [paint, scrollRef],
    );

    useEffect(() => () => release.current?.(), []);

    return start;
};
