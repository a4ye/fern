import { afterEach, describe, expect, it } from "bun:test";
import {
    normalizeImportUrl,
    parsePosting,
    scrapePosting,
    serverImportHost,
    serverImportRequestCost,
} from "@/lib/job-scrape";
import { isScrapedPosting } from "@/lib/job-import/shared";
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

    it("reads the arrangement a title states, where the block gives a plain city", () => {
        const html = jsonLd({
            "@type": "JobPosting",
            title: "DevOps Engineer, Blockchain Infra (Fully Remote)",
            jobLocation: { address: { addressLocality: "Warsaw" } },
        });
        expect(parsePosting(html).arrangement).toBe("remote");
    });

    it("keeps every structured address level for location matching", () => {
        const html = jsonLd({
            "@type": "JobPosting",
            title: "Backend Intern",
            jobLocation: {
                address: {
                    addressLocality: "Toronto",
                    addressRegion: "ON",
                    addressCountry: { name: "Canada" },
                },
            },
        });

        expect(parsePosting(html).location).toBe("Toronto, ON, Canada");
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
            payNote: null,
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

    it("takes a Rippling posting from its page data rather than its meta tags", () => {
        const page = {
            props: {
                pageProps: {
                    apiData: {
                        jobPost: {
                            name: "Software Engineer, AI Platform",
                            companyName: "Aalyria",
                            workLocations: ["Remote (San Francisco Bay Area)"],
                            payRangeDetails: [
                                {
                                    currency: "USD",
                                    frequency: "YEAR",
                                    rangeStart: 185000,
                                    rangeEnd: 215000,
                                },
                            ],
                        },
                    },
                },
            },
        };
        // The meta tags name the board, so a page read that stopped at them
        // would file this under "Rippling Recruiting".
        const html = `<html><head>
            <meta property="og:title" content="Software Engineer, AI Platform | Careers at Aalyria"/>
            <meta property="og:site_name" content="Rippling Recruiting"/>
            <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(page)}</script>
        </head></html>`;

        const posting = parsePosting(html);

        expect(posting).toMatchObject({
            company: "Aalyria",
            role: "Software Engineer, AI Platform",
            location: "Remote (San Francisco Bay Area)",
            arrangement: "remote",
            pay: "USD 185000-215000/yr",
            payNote: null,
            source: "rippling",
        });
    });

    it("believes the Ashby page over a schema.org block that calls hybrid remote", () => {
        // Ashby counts a hybrid posting as working away from an office, so its
        // page carries TELECOMMUTE for a job that is in the office half the
        // week. The board states the split itself, and that is the truer word.
        const html = `<html><head>
            <script type="application/ld+json">${JSON.stringify({
                "@type": "JobPosting",
                title: "Security Engineer, Cloud",
                hiringOrganization: { "@type": "Organization", name: "Ramp" },
                jobLocationType: "TELECOMMUTE",
            })}</script>
        </head><body>
            <script>window.__appData = {"posting":{"workplaceType":"Hybrid"}}</script>
        </body></html>`;

        expect(parsePosting(html)).toMatchObject({
            role: "Security Engineer, Cloud",
            company: "Ramp",
            arrangement: "hybrid",
        });
    });

    it("reads the arrangement Lever prints beside the location", () => {
        const html = `<html><head>
            <script type="application/ld+json">${JSON.stringify({
                "@type": "JobPosting",
                title: "Artist & Label Partnerships Manager",
                hiringOrganization: {
                    "@type": "Organization",
                    name: "Spotify",
                },
                jobLocation: { address: { addressLocality: "Dubai" } },
            })}</script>
        </head><body>
            <div class="sort-by-time posting-category capitalize-labels location">Dubai</div>
            <div class="sort-by-time posting-category capitalize-labels workplaceTypes">On-site</div>
        </body></html>`;

        expect(parsePosting(html)).toMatchObject({
            location: "Dubai",
            arrangement: "onsite",
        });
    });
});

describe("scrapePosting", () => {
    it("keeps arbitrary employer domains out of the server fallback", async () => {
        let fetched = false;
        globalThis.fetch = (async (_input: string | URL | Request) => {
            fetched = true;
            return new Response("");
        }) as typeof fetch;

        expect(
            await scrapePosting("https://careers.acme.com/platform-engineer"),
        ).toEqual({
            company: null,
            role: null,
            location: null,
            arrangement: null,
            pay: null,
            payNote: null,
            source: "none",
            employerUrl: null,
        });
        expect(fetched).toBeFalse();
    });

    it("stops asking a provider that has just turned it away", async () => {
        // Greenhouse answers the API read with a refusal. The board page is the
        // same provider, so reading it would be a second request inside that
        // refusal, which is what turns a throttle into a block.
        const asked: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            asked.push(String(input));
            return new Response("", { status: 429 });
        }) as typeof fetch;

        const posting = await scrapePosting(
            "https://job-boards.greenhouse.io/acme/jobs/5678",
        );

        expect(asked).toHaveLength(1);
        expect(asked[0]).toContain("boards-api.greenhouse.io");
        expect(posting.source).toBe("none");
    });

    it("still falls back to the board page when the API merely has nothing", async () => {
        const asked: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            asked.push(String(input));
            return String(input).includes("boards-api")
                ? new Response("", { status: 404 })
                : new Response(
                      jsonLd({
                          "@type": "JobPosting",
                          title: "Platform Engineer",
                      }),
                      { headers: { "content-type": "text/html" } },
                  );
        }) as typeof fetch;

        const posting = await scrapePosting(
            "https://job-boards.greenhouse.io/acme/jobs/5678",
        );

        expect(asked).toHaveLength(2);
        expect(posting.role).toBe("Platform Engineer");
    });

    it("never offers the word in an embed path as the company", async () => {
        // The embedded form's first path segment is "embed", and reading the
        // company out of it once offered every such posting as a job at "Embed".
        const asked: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            asked.push(String(input));
            return new Response("", { status: 404 });
        }) as typeof fetch;

        const posting = await scrapePosting(
            "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=5678",
        );

        expect(asked[0]).toContain(
            "boards-api.greenhouse.io/v1/boards/acme/jobs/5678",
        );
        expect(posting.company).toBe("Acme");
    });

    it("leaves the board page unread when the provider cannot spare it", async () => {
        // The API answered with nothing, so the page behind it would be a
        // second read. It is charged for at that point, and refused here.
        const asked: string[] = [];
        globalThis.fetch = (async (input: string | URL | Request) => {
            asked.push(String(input));
            return new Response("", { status: 404 });
        }) as typeof fetch;

        const posting = await scrapePosting(
            "https://job-boards.greenhouse.io/acme/jobs/5678",
            async () => false,
        );

        expect(asked).toHaveLength(1);
        expect(posting.source).toBe("none");
    });

    it("normalizes tracking parameters before shared caching", () => {
        expect(
            normalizeImportUrl(
                "https://jobs.lever.co/acme/123?utm_source=email&team=eng#apply",
            ),
        ).toBe("https://jobs.lever.co/acme/123?team=eng");
        expect(serverImportHost("https://jobs.lever.co/acme/123")).toBe(
            "jobs.lever.co",
        );
        expect(serverImportHost("https://careers.acme.com/123")).toBeNull();
        expect(
            serverImportRequestCost("https://simplify.jobs/p/123/engineer"),
        ).toBe(2);
        expect(serverImportRequestCost("https://jobs.lever.co/acme/123")).toBe(
            1,
        );
        // Greenhouse reserves one read, not two: its API answers most links on
        // its own, and the page behind it is charged for only when it is read.
        expect(
            serverImportRequestCost(
                "https://job-boards.greenhouse.io/acme/jobs/5678",
            ),
        ).toBe(1);
    });

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

describe("isScrapedPosting", () => {
    const POSTING = {
        company: "Acme",
        role: "Engineer",
        location: "Toronto",
        arrangement: "hybrid",
        pay: "CAD 140000-188000/yr",
        payNote: "Equity",
        source: "ashby",
        employerUrl: null,
    };

    it("accepts a posting the current extension sends", () => {
        expect(isScrapedPosting(POSTING)).toBeTrue();
    });

    // The extension is loaded unpacked from a download and never updates itself,
    // so a copy built before `payNote` existed is still out there sending
    // postings without it. Rejecting those would break importing outright.
    it("accepts a posting from an extension built before payNote existed", () => {
        const { payNote: _omitted, ...older } = POSTING;

        expect(isScrapedPosting(older)).toBeTrue();
    });

    it("rejects a posting whose fields are the wrong shape", () => {
        expect(isScrapedPosting({ ...POSTING, payNote: 7 })).toBeFalse();
        expect(
            isScrapedPosting({ ...POSTING, arrangement: "onsite-ish" }),
        ).toBeFalse();
        expect(isScrapedPosting({ ...POSTING, source: "workday" })).toBeFalse();
        expect(isScrapedPosting(null)).toBeFalse();
    });
});
