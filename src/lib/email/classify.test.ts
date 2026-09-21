import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ClassifierApplication } from "./classify";
import type { NormalizedEmail } from "./types";

type RawMatch = {
    emailIndex: number;
    applicationIndex: number;
    suggestedStatus: string;
    newRound: boolean;
    confidence: number;
    reasoning: string;
};

let matches: RawMatch[] = [];
const generateObject = mock(async () => ({ object: { matches } }));

mock.module("ai", () => ({ generateObject }));
mock.module("@ai-sdk/google", () => ({ google: () => "model" }));

const { classifyEmails } = await import("./classify");

const application = (
    currentStatus: ClassifierApplication["currentStatus"],
): ClassifierApplication => ({
    company: "Acme",
    role: "Engineer",
    currentStatus,
});

const email: NormalizedEmail = {
    id: "m-1",
    from: "Recruiter <r@acme.com>",
    subject: "Next round at Acme",
    snippet: "We would like to meet again",
    body: "We would like to meet you again for a second round.",
    receivedAt: new Date("2026-09-01T12:00:00.000Z"),
};

const raw = (overrides: Partial<RawMatch> = {}): RawMatch => ({
    emailIndex: 0,
    applicationIndex: 0,
    suggestedStatus: "interviewing",
    newRound: true,
    confidence: 0.9,
    reasoning: "The recruiter invited a second round.",
    ...overrides,
});

beforeEach(() => {
    matches = [];
    generateObject.mockClear();
});

describe("classifyEmails", () => {
    it("keeps a repeat of a status that can be held twice", async () => {
        matches = [raw()];

        const [match] = await classifyEmails(
            [application("interviewing")],
            [email],
        );

        expect(match.newRound).toBe(true);
    });

    // The model reports where the application got to, not where it was, so a
    // repeat of a status it does not hold is a plain move that arrived with the
    // flag set by mistake.
    it("drops the flag when the status is not the one already held", async () => {
        matches = [raw()];

        const [match] = await classifyEmails([application("applied")], [email]);

        expect(match.newRound).toBe(false);
        expect(match.suggestedStatus).toBe("interviewing");
    });

    // A second rejection or a second offer is not a round, and accepting one
    // would write a duplicate step into the application's trail.
    it("drops the flag for a status nobody holds twice", async () => {
        matches = [raw({ suggestedStatus: "rejected" })];

        const [match] = await classifyEmails(
            [application("rejected")],
            [email],
        );

        expect(match.newRound).toBe(false);
    });

    it("discards matches pointing outside the lists it was given", async () => {
        matches = [raw({ applicationIndex: 4 }), raw({ emailIndex: -1 })];

        const found = await classifyEmails(
            [application("interviewing")],
            [email],
        );

        expect(found).toEqual([]);
    });

    it("never pays for an empty side", async () => {
        expect(await classifyEmails([], [email])).toEqual([]);
        expect(await classifyEmails([application("applied")], [])).toEqual([]);
        expect(generateObject).not.toHaveBeenCalled();
    });
});
