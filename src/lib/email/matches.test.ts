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
    appliedAt: null,
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

const inbox = (...subjects: string[]) =>
    subjects.map((subject) => ({ subject }));

describe("usableMatches", () => {
    it("keeps a repeat of a status that can be held twice", () => {
        const [match] = usableMatches(
            [raw()],
            [application("interviewing")],
            inbox("Rox next steps"),
        );

        expect(match.newRound).toBe(true);
    });

    // Every repeat this inbox has produced, with the answer the user gave it.
    // The three replies were all dismissed, and all three are the same mail:
    // the arranging of a round that was already offered.
    it.each([
        "Re: Next Steps with Imbue",
        "Re: Jevis placed on the Rox API track — $2,000 + next week with our engineers",
        "Fwd: Next Steps with Imbue",
    ])("drops the flag for a round claimed in a reply: %p", (subject) => {
        const [match] = usableMatches(
            [raw()],
            [application("interviewing")],
            inbox(subject),
        );

        expect(match.newRound).toBe(false);
    });

    // The model reports where the application got to, not where it was, so a
    // repeat of a status it does not hold is a plain move that arrived with the
    // flag set by mistake.
    it("drops the flag when the status is not the one already held", () => {
        const [match] = usableMatches(
            [raw()],
            [application("applied")],
            inbox("Benchling - Interview"),
        );

        expect(match.newRound).toBe(false);
        expect(match.suggestedStatus).toBe("interviewing");
    });

    // A second rejection or a second offer is not a round, and accepting one
    // would write a duplicate step into the application's trail.
    it("drops the flag for a status nobody holds twice", () => {
        const [match] = usableMatches(
            [raw({ suggestedStatus: "rejected" })],
            [application("rejected")],
            inbox("Waymo Internship Update"),
        );

        expect(match.newRound).toBe(false);
    });

    // Both of these arrived in one sync. A duplicate-application notice read
    // against an accepted offer, and a thread quoting an interview that was
    // held before the offer came. Each named the right stage for the mail and
    // the wrong one for the application.
    it.each([
        ["offer_accepted", "applied"],
        ["offer_in_progress", "interviewing"],
        ["interviewing", "applied"],
        ["rejected", "online_assessment"],
    ] as const)(
        "discards a move back down the funnel: %s to %s",
        (currentStatus, suggestedStatus) => {
            expect(
                usableMatches(
                    [raw({ suggestedStatus })],
                    [application(currentStatus)],
                    inbox("Re: Duplicate application"),
                ),
            ).toEqual([]);
        },
    );

    // The middle of the funnel is flat: a take-home set after a phone screen
    // is the next step, not a step back.
    it.each([
        ["interviewing", "takehome"],
        ["onsite", "interviewing"],
        ["applied", "offer_in_progress"],
        ["onsite", "rejected"],
        ["ghosted", "interviewing"],
    ] as const)(
        "keeps a move onward: %s to %s",
        (currentStatus, suggestedStatus) => {
            const [match] = usableMatches(
                [raw({ suggestedStatus })],
                [application(currentStatus)],
                inbox("Imbue next steps"),
            );

            expect(match.suggestedStatus).toBe(suggestedStatus);
        },
    );

    it("discards matches pointing outside the lists it was given", () => {
        const found = usableMatches(
            [raw({ applicationIndex: 4 }), raw({ emailIndex: -1 })],
            [application("interviewing")],
            inbox("Rox next steps"),
        );

        expect(found).toEqual([]);
    });
});
