import { afterEach, describe, expect, it } from "bun:test";
import { parsePosting, scrapePosting } from "@/lib/job-scrape";
import { parsePay } from "@/lib/pay";

const jsonLd = (posting: Record<string, unknown>) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head></html>`;

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("parsePosting", () => {
    it("decodes HTML entities in titles and company names", () => {
        const html = jsonLd({
            "@type": "JobPosting",
            title: "GenAI &amp; AI/ML Engineering Intern",
            hiringOrganization: { "@type": "Organization", name: "Sand&#39;s" },
        });
        const posting = parsePosting(html);
        expect(posting.role).toBe("GenAI & AI/ML Engineering Intern");
        expect(posting.company).toBe("Sand's");
    });

    it("reads remote from the schema.org location type", () => {
        const html = jsonLd({
            "@type": "JobPosting",
            title: "Backend Intern",
            jobLocationType: "TELECOMMUTE",
        });
        expect(parsePosting(html).arrangement).toBe("remote");
    });

    it("falls back to reading the arrangement out of the location", () => {
        const html = jsonLd({
            "@type": "JobPosting",
            title: "Backend Intern",
            jobLocation: {
                address: {
                    addressLocality: "Toronto (Hybrid)",
                    addressRegion: "ON",
                },
            },
        });
        expect(parsePosting(html).arrangement).toBe("hybrid");
    });

    // The scraped pay is a suggestion the user can edit, and is stored through
    // the same parser as typed input, so the two have to agree.
    it("emits a pay string that parsePay can read into columns", () => {
        const html = jsonLd({
            "@type": "JobPosting",
            title: "Backend Intern",
            baseSalary: {
                currency: "CAD",
                value: {
                    minValue: 7000,
                    maxValue: 9000,
                    unitText: "MONTH",
                },
            },
        });
        const posting = parsePosting(html);
        expect(posting.pay).toBe("CAD 7000-9000/mo");
        expect(parsePay(posting.pay)).toMatchObject({
            payMin: "7000.00",
            payMax: "9000.00",
            payCurrency: "CAD",
            payPeriod: "monthly",
        });
    });

    it("decodes entities in OpenGraph fallbacks too", () => {
        const html = `<html><head>
            <meta property="og:title" content="Data &amp; Analytics Intern" />
            <meta property="og:site_name" content="Acme" />
        </head></html>`;
        const posting = parsePosting(html);
        expect(posting.role).toBe("Data & Analytics Intern");
        expect(posting.company).toBe("Acme");
        expect(posting.source).toBe("opengraph");
    });

    it("reads OpenGraph tags that put content before property", () => {
        const html = `<html><head>
            <meta content="Data Intern" property="og:title" data-next-head=""/>
            <meta content="Acme" property="og:site_name"/>
        </head></html>`;
        const posting = parsePosting(html);
        expect(posting.role).toBe("Data Intern");
        expect(posting.company).toBe("Acme");
    });

    it("splits the employer out of a Simplify OpenGraph title", () => {
        const html = `<html><head>
            <meta content="Tourism Assistant Intern @ University of Pikeville | Simplify" property="og:title"/>
            <meta content="Simplify Jobs" property="og:site_name"/>
        </head></html>`;
        const posting = parsePosting(html);
        expect(posting.role).toBe("Tourism Assistant Intern");
        expect(posting.company).toBe("University of Pikeville");
    });

    it("prefers Simplify page data and emits a parseable yearly salary", () => {
        const page = {
            props: {
                pageProps: {
                    jobPosting: {
                        title: "Platform Engineer",
                        job: { company: { name: "Acme" } },
                        locations: [{ value: "Toronto, ON (Hybrid)" }],
                        min_salary: 120000,
                        max_salary: 150000,
                        currency_type: "CAD",
                        salary_period: 4,
                    },
                },
            },
        };
        const html = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(page)}</script></head></html>`;

        const posting = parsePosting(html);

        expect(posting).toMatchObject({
            company: "Acme",
            role: "Platform Engineer",
            location: "Toronto, ON (Hybrid)",
            arrangement: "hybrid",
            pay: "CAD 120000-150000/yr",
            source: "simplify",
            employerUrl: null,
        });
        expect(parsePay(posting.pay)).toMatchObject({
            payMin: "120000.00",
            payMax: "150000.00",
            payCurrency: "CAD",
            payPeriod: "yearly",
        });
    });
});

describe("scrapePosting", () => {
    it("returns a cleaned employer URL as a separate suggestion", async () => {
        const simplifyUrl =
            "https://simplify.jobs/p/1234/platform-engineer-at-acme";
        const employerUrl =
            "https://boards.greenhouse.io/acme/jobs/5678?gh_src=simplify&utm_source=Simplify&UTM_ID=campaign&office=toronto";
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            if (url === "https://simplify.jobs/jobs/click/1234") {
                return new Response(null, {
                    status: 302,
                    headers: { location: employerUrl },
                });
            }
            if (url === simplifyUrl) {
                return new Response(
                    jsonLd({
                        "@type": "JobPosting",
                        title: "Platform Engineer",
                        hiringOrganization: { name: "Acme" },
                    }),
                );
            }
            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        const posting = await scrapePosting(simplifyUrl);

        expect(posting.role).toBe("Platform Engineer");
        expect(posting.employerUrl).toBe(
            "https://boards.greenhouse.io/acme/jobs/5678?office=toronto",
        );
        expect(posting.employerUrl).not.toBe(simplifyUrl);
    });

    it("still offers the employer URL when the Simplify page cannot be read", async () => {
        const simplifyUrl = "https://simplify.jobs/p/1234/platform-engineer";
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith("/jobs/click/1234")) {
                return new Response(null, {
                    status: 302,
                    headers: {
                        location: "https://jobs.acme.com/platform-engineer",
                    },
                });
            }
            throw new Error("Simplify is unavailable");
        }) as typeof fetch;

        const posting = await scrapePosting(simplifyUrl);

        expect(posting.source).toBe("none");
        expect(posting.employerUrl).toBe(
            "https://jobs.acme.com/platform-engineer",
        );
    });

    it("does not offer a destination from a non-redirect response", async () => {
        const simplifyUrl = "https://simplify.jobs/p/1234/platform-engineer";
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith("/jobs/click/1234")) {
                return new Response(null, {
                    status: 200,
                    headers: { location: "javascript:alert(1)" },
                });
            }
            return new Response("");
        }) as typeof fetch;

        expect((await scrapePosting(simplifyUrl)).employerUrl).toBeNull();
    });

    it("does not offer a redirect with a non-web scheme", async () => {
        const simplifyUrl = "https://simplify.jobs/p/1234/platform-engineer";
        globalThis.fetch = (async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith("/jobs/click/1234")) {
                return new Response(null, {
                    status: 302,
                    headers: { location: "javascript:alert(1)" },
                });
            }
            return new Response("");
        }) as typeof fetch;

        expect((await scrapePosting(simplifyUrl)).employerUrl).toBeNull();
    });

    it("does not fetch a posting with a non-web scheme", async () => {
        let fetched = false;
        globalThis.fetch = (async (_input: string | URL | Request) => {
            fetched = true;
            return new Response("");
        }) as typeof fetch;

        const posting = await scrapePosting("file:///etc/passwd");

        expect(posting.source).toBe("none");
        expect(fetched).toBeFalse();
    });
});
