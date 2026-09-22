import { describe, expect, it } from "bun:test";
import {
    usableMatches,
    type ClassifierApplication,
    type RawMatch,
} from "./matches";

const application = (
    currentStatus: ClassifierApplication["currentStatus"],
): ClassifierApplication => ({
    company: "Acme",
    role: "Engineer",
    currentStatus,
});

const raw = (overrides: Partial<RawMatch> = {}): RawMatch => ({
    emailIndex: 0,
    applicationIndex: 0,
    suggestedStatus: "interviewing",
    newRound: true,
    confidence: 0.9,
    reasoning: "The recruiter invited a second round.",
    ...overrides,
});

describe("usableMatches", () => {
    it("keeps a repeat of a status that can be held twice", () => {
        const [match] = usableMatches(
            [raw()],
            [application("interviewing")],
            1,
        );

        expect(match.newRound).toBe(true);
    });

    // The model reports where the application got to, not where it was, so a
    // repeat of a status it does not hold is a plain move that arrived with the
    // flag set by mistake.
    it("drops the flag when the status is not the one already held", () => {
        const [match] = usableMatches([raw()], [application("applied")], 1);

        expect(match.newRound).toBe(false);
        expect(match.suggestedStatus).toBe("interviewing");
    });

    // A second rejection or a second offer is not a round, and accepting one
    // would write a duplicate step into the application's trail.
    it("drops the flag for a status nobody holds twice", () => {
        const [match] = usableMatches(
            [raw({ suggestedStatus: "rejected" })],
            [application("rejected")],
            1,
        );

        expect(match.newRound).toBe(false);
    });

    it("discards matches pointing outside the lists it was given", () => {
        const found = usableMatches(
            [raw({ applicationIndex: 4 }), raw({ emailIndex: -1 })],
            [application("interviewing")],
            1,
        );

        expect(found).toEqual([]);
    });
});
