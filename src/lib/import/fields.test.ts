import { describe, expect, test } from "bun:test";
import { matchColumns } from "@/lib/import/fields";

describe("column matching", () => {
    test("reads the headings this app's own export writes", () => {
        expect(
            matchColumns([
                "Company",
                "Role",
                "Status",
                "Location",
                "Arrangement",
                "Applied",
                "Link",
                "Notes",
            ]),
        ).toEqual({
            company: 0,
            role: 1,
            status: 2,
            location: 3,
            arrangement: 4,
            appliedAt: 5,
            url: 6,
            notes: 7,
        });
    });

    test("reads the names other trackers use", () => {
        const mapping = matchColumns([
            "Employer",
            "Job Title",
            "Stage",
            "Date Applied",
            "Salary Range",
            "Posting Link",
        ]);
        expect(mapping).toEqual({
            company: 0,
            role: 1,
            status: 2,
            appliedAt: 3,
            pay: 4,
            url: 5,
        });
    });

    test("is not thrown by case or punctuation", () => {
        expect(
            matchColumns(["COMPANY NAME", "job-title", "applied_on"]),
        ).toEqual({ company: 0, role: 1, appliedAt: 2 });
    });

    test("sends an abbreviation to the field that means it, not the one it prefixes", () => {
        // "Comp" prefixes "Company" but is exactly what people call pay, and an
        // exact alias has to outrank a label prefix for that to come out right.
        const mapping = matchColumns(["Company", "Comp"]);
        expect(mapping.company).toBe(0);
        expect(mapping.pay).toBe(1);
    });

    test("leaves a heading it cannot place alone rather than guessing", () => {
        const mapping = matchColumns([
            "Company",
            "Recruiter phone number",
            "Who referred me",
        ]);
        expect(mapping).toEqual({ company: 0 });
    });

    test("never gives two fields the same column", () => {
        const mapping = matchColumns(["Job", "Job"]);
        const columns = Object.values(mapping);
        expect(new Set(columns).size).toBe(columns.length);
    });

    test("passes over a blank heading", () => {
        expect(matchColumns(["", "Company", "   "])).toEqual({ company: 1 });
    });
});
