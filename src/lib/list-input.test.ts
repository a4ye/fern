import { describe, expect, it } from "bun:test";
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from "@/lib/constraints";
import { parseListInput, parseListUpdate } from "@/lib/list-input";

describe("client list input", () => {
    it("normalizes the values the same way as the server schema", () => {
        expect(
            parseListInput({ name: "  Fall roles  ", description: "   " }),
        ).toEqual({
            ok: true,
            data: { name: "Fall roles", description: null },
        });
    });

    it("keeps the server schema's boundary messages", () => {
        expect(parseListInput({ name: " ", description: null })).toEqual({
            ok: false,
            error: "Name is required.",
        });
        expect(
            parseListInput({
                name: "a".repeat(LIST_NAME_MAX + 1),
                description: null,
            }),
        ).toEqual({
            ok: false,
            error: `Name must be ${LIST_NAME_MAX} characters or fewer.`,
        });
        expect(
            parseListInput({
                name: "Fall",
                description: "a".repeat(LIST_DESCRIPTION_MAX + 1),
            }),
        ).toEqual({
            ok: false,
            error: `Description must be ${LIST_DESCRIPTION_MAX} characters or fewer.`,
        });
    });

    it("carries a valid list status into an update", () => {
        expect(
            parseListUpdate({
                name: "Fall",
                description: "Graduate roles",
                status: "active",
            }),
        ).toEqual({
            ok: true,
            data: {
                name: "Fall",
                description: "Graduate roles",
                status: "active",
            },
        });
    });
});
