import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import {
    LIST_DESCRIPTION_MAX,
    LIST_NAME_MAX,
    applicationDetailSchema,
    firstIssue,
    listCreateSchema,
    listUpdateSchema,
} from "@/lib/validation";

const issue = <T>(result: z.ZodSafeParseResult<T>): string | null =>
    result.success ? null : firstIssue(result.error);

const create = (name: string, description?: string | null) =>
    listCreateSchema.safeParse({ name, description });

const update = (status: string) =>
    listUpdateSchema.safeParse({ name: "Fall 2026", status });

describe("listCreateSchema", () => {
    it("trims the name", () => {
        const result = create("  Fall 2026  ");
        expect(result.success && result.data.name).toBe("Fall 2026");
    });

    it("rejects a name that is blank or only whitespace", () => {
        expect(issue(create(""))).toBe("Name is required.");
        expect(issue(create("   "))).toBe("Name is required.");
    });

    it("caps the name at its limit, measured after trimming", () => {
        const limit = "a".repeat(LIST_NAME_MAX);
        expect(create(` ${limit} `).success).toBe(true);
        expect(issue(create(`${limit}a`))).toBe(
            `Name must be ${LIST_NAME_MAX} characters or fewer.`,
        );
    });

    it("collapses an empty description to null", () => {
        for (const description of ["", "   ", null, undefined]) {
            const result = create("Fall 2026", description);
            expect(result.success && result.data.description).toBeNull();
        }
    });

    it("trims the description and caps its length", () => {
        const result = create("Fall 2026", "  New grad roles  ");
        expect(result.success && result.data.description).toBe(
            "New grad roles",
        );
        expect(issue(create("Fall 2026", "a".repeat(281)))).toBe(
            `Description must be ${LIST_DESCRIPTION_MAX} characters or fewer.`,
        );
    });
});

describe("listUpdateSchema", () => {
    it("accepts only the known statuses", () => {
        for (const status of ["active", "closed", "archived"]) {
            expect(update(status).success).toBe(true);
        }
        expect(issue(update("deleted"))).toBe("Choose a valid status.");
    });
});

const detail = (pay: {
    payMin?: string;
    payMax?: string;
    bonus?: string;
    payCurrency?: string;
}) =>
    applicationDetailSchema.safeParse({
        company: "Circleback",
        payCurrency: "USD",
        payPeriod: "yearly",
        arrangement: null,
        ...pay,
    });

describe("applicationDetailSchema", () => {
    it("keeps amounts as decimal strings rather than numbers", () => {
        const result = detail({ payMin: "120000", payMax: "140000.50" });
        expect(result.success && result.data.payMin).toBe("120000");
        expect(result.success && result.data.payMax).toBe("140000.50");
    });

    it("takes typed separators out of an amount", () => {
        const result = detail({ payMin: " 120,000 " });
        expect(result.success && result.data.payMin).toBe("120000");
    });

    it("collapses a blank amount to null and rejects a non-number", () => {
        expect(detail({ bonus: "  " }).success).toBe(true);
        expect(issue(detail({ bonus: "a lot" }))).toBe(
            "Bonus must be a number, with at most two decimals.",
        );
    });

    it("rejects a maximum below the minimum, which the column also forbids", () => {
        expect(issue(detail({ payMin: "140000", payMax: "120000" }))).toBe(
            "Maximum pay cannot be less than the minimum.",
        );
        expect(detail({ payMin: "140000" }).success).toBe(true);
    });

    it("takes any three-letter currency code, in the column's own shape", () => {
        const result = detail({ payCurrency: " sek " });
        expect(result.success && result.data.payCurrency).toBe("SEK");
        expect(issue(detail({ payCurrency: "US" }))).toBe(
            "Choose a valid currency.",
        );
        expect(issue(detail({ payCurrency: "US$" }))).toBe(
            "Choose a valid currency.",
        );
    });
});
