import { describe, expect, test } from "bun:test";
import { edgeScroll, rowAt } from "@/components/dashboard/use-drag-select";

// A 40px row in a list whose first row starts 100px down the window.
const ROW = 40;
const TOP = 100;

const at = (y: number, count = 10) => rowAt(y, TOP, ROW, count);

describe("rowAt", () => {
    test("reads the row the pointer is inside", () => {
        expect(at(TOP)).toBe(0);
        expect(at(TOP + 39)).toBe(0);
        expect(at(TOP + 40)).toBe(1);
        expect(at(TOP + 99)).toBe(2);
    });

    test("answers for rows that were never drawn", () => {
        // Row 840 of a thousand is far outside any window, and a drag that
        // reaches it still has to paint it.
        expect(at(TOP + 33_600, 1000)).toBe(840);
    });

    test("clamps a pointer dragged past either end", () => {
        expect(at(TOP - 500)).toBe(0);
        expect(at(TOP + 10_000)).toBe(9);
    });

    test("holds still when there is nothing to measure", () => {
        expect(rowAt(500, TOP, 0, 10)).toBe(0);
        expect(rowAt(500, TOP, ROW, 0)).toBe(0);
    });
});

// A box 400px tall sitting 100px down the window, so its edge zones are the
// full 56px.
const BOX_TOP = 100;
const BOX_BOTTOM = 500;

const scroll = (y: number) => edgeScroll(y, BOX_TOP, BOX_BOTTOM);

describe("edgeScroll", () => {
    test("stands still through the middle", () => {
        expect(scroll(BOX_TOP + 56)).toBe(0);
        expect(scroll(300)).toBe(0);
        expect(scroll(BOX_BOTTOM - 56)).toBe(0);
    });

    test("travels up near the top and down near the bottom", () => {
        expect(scroll(BOX_TOP + 28)).toBeCloseTo(-8);
        expect(scroll(BOX_BOTTOM - 28)).toBeCloseTo(8);
    });

    test("runs at full speed once the pointer leaves the box", () => {
        expect(scroll(BOX_TOP)).toBeCloseTo(-16);
        expect(scroll(BOX_TOP - 900)).toBeCloseTo(-16);
        expect(scroll(BOX_BOTTOM + 900)).toBeCloseTo(16);
    });

    test("keeps a dead middle in a short box", () => {
        // Zones of 56px would meet and overlap in a box only 80px tall, which
        // would leave a drag no place to rest. They shrink with the box.
        expect(edgeScroll(140, 100, 180)).toBe(0);
        expect(edgeScroll(105, 100, 180)).toBeCloseTo(-12);
        expect(edgeScroll(175, 100, 180)).toBeCloseTo(12);
    });

    test("gives up on a box with no height", () => {
        expect(edgeScroll(100, 100, 100)).toBe(0);
    });
});
