import { describe, expect, it } from "bun:test";
import { STATUS_KEYWORDS, STATUS_META } from "@/components/dashboard/data";
import type { ApplicationStatus } from "@/components/dashboard/data";
import { matchScore, searchScore } from "@/lib/fuzzy";

const STATUSES = Object.keys(STATUS_META) as ApplicationStatus[];

// Mirrors how the dropdown ranks: best score wins, ties keep declaration order.
const topStatus = (query: string): ApplicationStatus | null => {
    const ranked = STATUSES.map((status) => ({
        status,
        score: searchScore(
            query,
            STATUS_META[status].label,
            STATUS_KEYWORDS[status],
        ),
    }))
        .filter((entry) => entry.score > 0)
        .sort((first, second) => second.score - first.score);
    return ranked[0]?.status ?? null;
};

describe("matchScore", () => {
    it("ranks exact above prefix above substring", () => {
        const exact = matchScore("onsite", "Onsite");
        const prefix = matchScore("onsi", "Onsite");
        const substring = matchScore("nsit", "Onsite");
        expect(exact).toBeGreaterThan(prefix);
        expect(prefix).toBeGreaterThan(substring);
    });

    it("ignores case, spacing, and punctuation", () => {
        expect(matchScore("take home", "Take-home")).toBe(
            matchScore("Take-Home", "take home"),
        );
        expect(matchScore("takehome", "Take-home")).toBeGreaterThan(0);
    });

    it("matches scattered characters as a subsequence", () => {
        expect(matchScore("onas", "Online assessment")).toBeGreaterThan(0);
    });

    it("prefers a contiguous subsequence run over a scattered one", () => {
        expect(matchScore("asse", "Online assessment")).toBeGreaterThan(
            matchScore("oiea", "Online assessment"),
        );
    });

    it("forgives a transposition", () => {
        expect(matchScore("intreviewing", "Interviewing")).toBeGreaterThan(0);
    });

    it("forgives a typo in a partially typed word", () => {
        expect(matchScore("rejcted", "Rejected")).toBeGreaterThan(0);
        expect(matchScore("assessmnet", "Online assessment")).toBeGreaterThan(
            0,
        );
    });

    it("does not forgive typos in very short queries", () => {
        expect(matchScore("xz", "Onsite")).toBe(0);
    });

    it("returns 0 for unrelated text", () => {
        expect(matchScore("zzzzzz", "Interviewing")).toBe(0);
        expect(matchScore("", "Interviewing")).toBe(0);
    });

    it("breaks ties toward the shorter label", () => {
        expect(matchScore("offer", "Offer")).toBeGreaterThan(
            matchScore("offer", "Offer in progress"),
        );
    });
});

describe("searchScore", () => {
    it("ranks a label hit above a keyword hit of the same kind", () => {
        expect(searchScore("applied", "Applied")).toBeGreaterThan(
            searchScore("applied", "Rejected", ["applied"]),
        );
    });

    it("ranks a strong keyword hit above a weak label hit", () => {
        expect(searchScore("oa", "Online assessment", ["oa"])).toBeGreaterThan(
            searchScore("oa", "Offer accepted"),
        );
    });
});

describe("status ranking", () => {
    const cases: [string, ApplicationStatus][] = [
        ["oa", "online_assessment"],
        ["hackerrank", "online_assessment"],
        ["phone screen", "interviewing"],
        ["superday", "onsite"],
        ["no reply", "ghosted"],
        ["signed", "offer_accepted"],
        ["negotiating", "offer_in_progress"],
        ["rescinded", "offer_rescinded"],
        ["denied", "rejected"],
        ["todo", "not_applied"],
        ["case study", "takehome"],
    ];

    for (const [query, expected] of cases) {
        it(`puts "${query}" on ${expected}`, () => {
            expect(topStatus(query)).toBe(expected);
        });
    }

    it("survives misspelled queries", () => {
        expect(topStatus("intreviewing")).toBe("interviewing");
        expect(topStatus("rejcted")).toBe("rejected");
        expect(topStatus("hackerank")).toBe("online_assessment");
        expect(topStatus("negotiaing")).toBe("offer_in_progress");
    });

    it("finds nothing for gibberish", () => {
        expect(topStatus("qqqqqqq")).toBeNull();
    });
});
