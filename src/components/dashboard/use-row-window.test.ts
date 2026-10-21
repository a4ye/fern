import { describe, expect, test } from "bun:test";
import { firstGuess, windowFor } from "@/components/dashboard/use-row-window";

// A 40px row in a 400px viewport: ten rows fit, and eight more are drawn past
// each edge.
const ROW = 40;
const VIEW = 400;

const at = (scrolled: number, count: number) =>
    windowFor(scrolled, VIEW, ROW, count);

describe("windowFor", () => {
    test("draws a short list whole", () => {
        expect(at(0, 150)).toEqual({
            start: 0,
            end: 150,
            padTop: 0,
            padBottom: 0,
        });
    });

    test("draws a long list from the top without padding above it", () => {
        const drawn = at(0, 1000);
        expect(drawn.start).toBe(0);
        expect(drawn.padTop).toBe(0);
        // Ten rows on screen plus the overscan below them.
        expect(drawn.end).toBe(18);
        expect(drawn.padBottom).toBe(982);
    });

    test("moves the window with the scroll and pads both sides", () => {
        const drawn = at(4000, 1000);
        expect(drawn.start).toBe(92);
        expect(drawn.end).toBe(118);
        expect(drawn.padTop).toBe(92);
        expect(drawn.padBottom).toBe(882);
    });

    test("always accounts for every row", () => {
        for (const scrolled of [0, 500, 4000, 39_000, 39_999]) {
            const drawn = at(scrolled, 1000);
            expect(
                drawn.padTop + (drawn.end - drawn.start) + drawn.padBottom,
            ).toBe(1000);
        }
    });

    test("stops at the last row rather than padding past it", () => {
        const drawn = at(39_600, 1000);
        expect(drawn.end).toBe(1000);
        expect(drawn.padBottom).toBe(0);
    });

    test("treats a list scrolled above the viewport as being at the top", () => {
        expect(at(-250, 1000).start).toBe(0);
    });

    test("draws the list whole rather than nothing when unmeasured", () => {
        expect(windowFor(0, VIEW, 0, 1000)).toEqual({
            start: 0,
            end: 1000,
            padTop: 0,
            padBottom: 0,
        });
    });
});

// The real table's rows, 2.5rem tall, which the browser default makes 40px.
const ROW_REM = 2.5;

describe("firstGuess", () => {
    test("draws a screenful of a long list, not the whole thing", () => {
        const drawn = firstGuess(1146, ROW_REM);
        expect(drawn.start).toBe(0);
        // A 1600px guess holds 40 rows at 40px, plus the overscan below them.
        expect(drawn.end).toBe(48);
        expect(drawn.padBottom).toBe(1098);
    });

    test("covers the tallest screen the table could be capped at 70vh of", () => {
        // 48 rows is 1920px of table, past the 1512px a 2160-tall screen
        // shows, so nothing is left to fill in under the last row.
        expect(firstGuess(1146, ROW_REM).end * ROW_REM * 16).toBeGreaterThan(
            2160 * 0.7,
        );
    });

    test("leaves a short list whole, so find-in-page still reaches it", () => {
        expect(firstGuess(150, ROW_REM)).toEqual({
            start: 0,
            end: 150,
            padTop: 0,
            padBottom: 0,
        });
    });

    test("holds the guess steady however long the list is", () => {
        // A list past the threshold is windowed, and what the server draws for
        // it does not grow with it: that is what keeps a 2,000-row list from
        // costing 2,000 rows of render and hydration.
        const widest = firstGuess(500, ROW_REM).end;
        for (const count of [500, 1146, 2000]) {
            expect(firstGuess(count, ROW_REM).end).toBe(widest);
        }
    });
});
