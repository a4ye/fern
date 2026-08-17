import { describe, expect, it } from "bun:test";
import { cleanLink } from "@/lib/clean-link";

describe("cleanLink", () => {
    describe("tracking parameters", () => {
        it("drops utm campaign parameters", () => {
            expect(
                cleanLink(
                    "https://jobs.example.com/careers/42?utm_source=newsletter&utm_medium=email",
                ),
            ).toBe("https://jobs.example.com/careers/42");
        });

        it("drops ad click identifiers on any host", () => {
            expect(
                cleanLink(
                    "https://boards.example.com/job?gclid=abc&fbclid=xyz",
                ),
            ).toBe("https://boards.example.com/job");
        });

        it("keeps the parameters that identify the posting", () => {
            expect(
                cleanLink(
                    "https://boards.greenhouse.io/acme/jobs/4001?gh_src=abcd&gh_jid=4001",
                ),
            ).toBe("https://boards.greenhouse.io/acme/jobs/4001?gh_jid=4001");
        });

        // The board is Greenhouse, but it is served from the employer's own
        // domain, which is where most applications are started from.
        it("strips an ATS source tag on an employer's own domain", () => {
            expect(
                cleanLink(
                    "https://www.dmgmedia.co.uk/careers/jobs/ai-engineer-internship/?gh_jid=8130352&gh_src=Simplify",
                ),
            ).toBe(
                "https://www.dmgmedia.co.uk/careers/jobs/ai-engineer-internship/?gh_jid=8130352",
            );
        });

        it("matches parameter names regardless of case", () => {
            expect(cleanLink("https://example.com/job?UTM_Source=x&id=9")).toBe(
                "https://example.com/job?id=9",
            );
        });
    });

    describe("site-scoped parameters", () => {
        it("strips LinkedIn search tracking down to the posting", () => {
            expect(
                cleanLink(
                    "https://www.linkedin.com/jobs/view/4012345678/?refId=a&trackingId=b&trk=flagship_search&position=1&pageNum=0",
                ),
            ).toBe("https://www.linkedin.com/jobs/view/4012345678/");
        });

        it("keeps the Indeed job key while dropping its referrer trail", () => {
            expect(
                cleanLink(
                    "https://www.indeed.com/viewjob?jk=9f2c1&from=serp&tk=1h9&vjs=3",
                ),
            ).toBe("https://www.indeed.com/viewjob?jk=9f2c1");
        });

        it("leaves a site-scoped name alone on a different host", () => {
            const link = "https://careers.example.com/apply?from=team-page";
            expect(cleanLink(link)).toBe(link);
        });
    });

    describe("links left as they are", () => {
        it("returns a clean link unchanged, without normalising it", () => {
            expect(cleanLink("https://example.com")).toBe(
                "https://example.com",
            );
        });

        it("returns text that is not a link", () => {
            expect(cleanLink("  Software Engineer, Acme  ")).toBe(
                "Software Engineer, Acme",
            );
        });

        it("leaves non-web schemes alone", () => {
            expect(cleanLink("mailto:jobs@example.com?utm_source=x")).toBe(
                "mailto:jobs@example.com?utm_source=x",
            );
        });

        it("keeps the fragment a posting page routes on", () => {
            expect(
                cleanLink("https://example.com/careers?utm_source=x#job-42"),
            ).toBe("https://example.com/careers#job-42");
        });
    });
});
