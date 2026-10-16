import { describe, expect, it } from "bun:test";
import { isAdministrativeNotice } from "./notices";
import type { NormalizedEmail } from "./types";

const email = (subject: string, body = ""): NormalizedEmail => ({
    id: "m-1",
    from: "no-reply@us.greenhouse-mail.io",
    subject,
    snippet: body.slice(0, 80),
    body,
    receivedAt: new Date("2026-10-01T12:00:00.000Z"),
});

describe("isAdministrativeNotice", () => {
    // The mail that sent an applied row to rejected at 0.9 confidence.
    it("holds back a consent renewal from an applicant tracking system", () => {
        expect(
            isAdministrativeNotice(
                email(
                    "Privacy and Compliance Notification from Goodnotes",
                    "In line with data protection laws, we require your consent to keep storing your personal details for recruitment purposes.",
                ),
            ),
        ).toBe(true);
    });

    it.each([
        "Update to our Privacy Policy",
        "Your data retention preferences",
        "Changes to our Terms of Service",
        "GDPR: confirm your details",
        "We have updated our cookie settings",
    ])("holds back %p", (subject) => {
        expect(isAdministrativeNotice(email(subject))).toBe(true);
    });

    // Every one of these is a real move, and the words that mark a notice are
    // absent from the subject even where the footer carries them.
    it.each([
        "Update on your application for Software Engineer",
        "Interview invitation: Backend Engineer at Ramp",
        "Your offer from Tower Research",
        "Next step: online assessment for Data Engineer",
    ])("lets %p through", (subject) => {
        expect(
            isAdministrativeNotice(
                email(
                    subject,
                    "We retain candidate data for 24 months in line with our privacy policy.",
                ),
            ),
        ).toBe(false);
    });
});
