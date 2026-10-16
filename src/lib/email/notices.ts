import type { NormalizedEmail } from "@/lib/email/types";

// Mail a company sends about its own record-keeping rather than about where an
// application stands: a privacy policy update, a consent renewal, a data
// retention notice. Greenhouse sends one to everybody it holds a record for,
// and it reads like the end of something, because it is about deleting
// details. Asked what it implies, the model answers "rejected" and is sure of
// it, so nothing downstream catches it: the mail names the company, and the
// move it proposes is one the application has not made.
//
// The test is the subject line on its own. A company announces a decision in
// the subject, and none of the words below carry one. A genuine rejection that
// mentions data retention mentions it in the footer, which is the reason the
// body is not read here.
const NOTICE_SUBJECTS = [
    "privacy",
    "data protection",
    "data retention",
    "gdpr",
    "ccpa",
    "terms of service",
    "terms of use",
    "cookie",
];

export const isAdministrativeNotice = (email: NormalizedEmail): boolean => {
    const subject = email.subject.toLowerCase();
    return NOTICE_SUBJECTS.some((phrase) => subject.includes(phrase));
};
