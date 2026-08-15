import { describe, expect, test } from "bun:test";
import { windowFor } from "@/components/dashboard/use-row-window";

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
