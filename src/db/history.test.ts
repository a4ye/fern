import { describe, expect, it } from "bun:test";
import {
    decodeHistoryActions,
    encodeHistoryActions,
    historyActionRunsMaintenance,
    type StoredHistoryAction,
} from "@/db/history";

const actions = Array.from({ length: 500 }, (_, index) => ({
    id: String(index + 1),
    kind: 4,
    affectedCount: 1,
    data: {
        a: [
            {
                i: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
                n: `Company ${index % 25}`,
                f: { s: ["applied", "interviewing"] },
            },
        ],
    },
    reversible: true,
    occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    undoneAt: null,
})) satisfies StoredHistoryAction[];

describe("PostgreSQL history archives", () => {
    it("round-trips every action without losing granularity", () => {
        expect(decodeHistoryActions(encodeHistoryActions(actions))).toEqual(
            actions,
        );
    });

    it("compresses a representative chunk below one fifth of its JSON size", () => {
        const jsonBytes = Buffer.byteLength(JSON.stringify(actions));
        const compressedBytes = encodeHistoryActions(actions).byteLength;

        expect(compressedBytes).toBeLessThan(jsonBytes / 5);
    });

    it("checks only four writes in each block of 128 for maintenance", () => {
        expect(historyActionRunsMaintenance("127")).toBe(false);
        expect(historyActionRunsMaintenance("128")).toBe(true);
        expect(historyActionRunsMaintenance("131")).toBe(true);
        expect(historyActionRunsMaintenance("132")).toBe(false);
    });
});
