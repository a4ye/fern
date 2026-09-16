import { describe, expect, it } from "bun:test";
import type { z } from "zod";
import { toDateInput } from "@/components/dashboard/data";
import {
    APPLIED_MIN,
    APPLIED_MIN_YEAR,
    LIST_DESCRIPTION_MAX,
    LIST_NAME_MAX,
    applicationDetailSchema,
    firstIssue,
    githubUsernameSchema,
    listCreateSchema,
    listUpdateSchema,
    timeZoneSchema,
} from "@/lib/validation";

const issue = <T>(result: z.ZodSafeParseResult<T>): string | null =>
    result.success ? null : firstIssue(result.error);

const shiftToday = (days: number): string => {
    const now = new Date();
    return toDateInput(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + days),
    );
};

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

describe("timeZoneSchema", () => {
    it("accepts IANA zones and rejects unknown ones", () => {
        expect(timeZoneSchema.safeParse("America/Toronto").success).toBe(true);
        expect(timeZoneSchema.safeParse("Pacific/Kiritimati").success).toBe(
            true,
        );
        expect(issue(timeZoneSchema.safeParse("Moon/Sea_of_Tranquility"))).toBe(
            "Choose a valid time zone.",
        );
    });
});

const detail = (pay: {
    payMin?: string;
    payMax?: string;
    bonus?: string;
    payCurrency?: string;
    appliedAt?: string;
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

    it("caps an amount at what numeric(12, 2) holds", () => {
        expect(detail({ payMin: "9999999999.99" }).success).toBe(true);
        expect(issue(detail({ payMin: "10000000000" }))).toBe(
            "Minimum pay must be a number, with at most two decimals.",
        );
    });

    it("rejects a date of the right shape that never happened", () => {
        for (const day of ["2026-02-31", "2026-13-01", "2026-00-10"]) {
            expect(issue(detail({ appliedAt: day }))).toBe(
                "Applied date must be a real date.",
            );
        }
    });

    it("rejects a date outside the window an application can fall in", () => {
        const outside = `Applied date must fall between ${APPLIED_MIN_YEAR} and today.`;
        expect(issue(detail({ appliedAt: "1989-12-31" }))).toBe(outside);
        expect(issue(detail({ appliedAt: shiftToday(30) }))).toBe(outside);
    });

    it("takes today, and the day after it as time zone slack", () => {
        expect(detail({ appliedAt: shiftToday(0) }).success).toBe(true);
        expect(detail({ appliedAt: shiftToday(1) }).success).toBe(true);
        expect(detail({ appliedAt: APPLIED_MIN }).success).toBe(true);
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

describe("githubUsernameSchema", () => {
    const name = (value: string) => githubUsernameSchema.safeParse(value);
    const rejected = "That is not a GitHub username.";

    it("takes the handles GitHub itself issues", () => {
        for (const handle of [
            "octocat",
            "a",
            "a4ye",
            "a-b-c",
            "A1",
            "9lives",
        ]) {
            expect(name(handle).success).toBe(true);
        }
        expect(name("  octocat  ").data).toBe("octocat");
        expect(name("a".repeat(39)).success).toBe(true);
    });

    it("turns away anything GitHub would not have issued", () => {
        expect(issue(name(""))).toBe("Enter a GitHub username.");
        expect(issue(name("   "))).toBe("Enter a GitHub username.");
        expect(issue(name("a".repeat(40)))).toBe(rejected);
        // Leading, trailing and doubled hyphens are all refused by GitHub, so
        // spending a request on one would only be told the same thing.
        expect(issue(name("-octocat"))).toBe(rejected);
        expect(issue(name("octocat-"))).toBe(rejected);
        expect(issue(name("oct--ocat"))).toBe(rejected);
    });

    // This value is interpolated into the path of a request to GitHub, so
    // anything that could steer that request must not get past the schema.
    it("turns away anything that could reshape the lookup URL", () => {
        for (const attempt of [
            "octocat/repos",
            "../users/octocat",
            "octocat?tab=x",
            "octocat#x",
            "octocat%2F",
            "octo cat",
            "octo\ncat",
        ]) {
            expect(name(attempt).success).toBe(false);
        }
    });
});
