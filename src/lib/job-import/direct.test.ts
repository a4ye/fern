import { afterEach, describe, expect, it } from "bun:test";
import { importDirect, isDirectlyReadable } from "@/lib/job-import/direct";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// Answers shaped like the ones these APIs actually return, taken from live
// reads rather than from the docs.
const LEVER_POSTING = {
    id: "ac978161-6f46-4f6b-ad9e-a258e642751c",
    text: "Administrative Business Partner",
    workplaceType: "hybrid",
    categories: {
        commitment: "Full-time",
        location: "London, United Kingdom",
        team: "Administrative",
    },
    salaryRange: {
        interval: "per-year-salary",
        currency: "USD",
        min: 150000,
        max: 180000,
    },
    hostedUrl: "https://jobs.lever.co/palantir/ac978161",
};

// Greenhouse states the amounts in cents and gives them no interval of their
// own, only the heading they are printed under.
const GREENHOUSE_JOB = {
    title: "Software Engineer, Infrastructure",
    company_name: "Anthropic",
    location: { name: "San Francisco, CA" },
    pay_input_ranges: [
        {
            min_cents: 22280000,
            max_cents: 29000000,
            currency_type: "USD",
            title: "Annual Salary:",
        },
    ],
};

const RIPPLING_JOB = {
    uuid: "e599291c-b244-4dfc-a1e9-8bb5dcc11f30",
    name: "Software Engineer, AI Platform",
    workLocations: ["Remote (San Francisco Bay Area)"],
    employmentType: { label: "SALARIED_FT", id: "Salaried, full-time" },
    companyName: "Aalyria",
    board: { slug: "aalyria-careers", companyName: "Aalyria" },
    payRangeDetails: [
        {
            location: "Remote (San Francisco Bay Area)",
            currency: "USD",
            frequency: "YEAR",
            rangeStart: 185000,
            rangeEnd: 215000,
            isRemote: true,
        },
    ],
};

// `summaryComponents` is the offer broken into figures, already merged across
// the per-location tiers. The display summary beside it is what a person reads.
const ASHBY_BOARD = {
    jobs: [
        {
            id: "d3bc1ced",
            title: "Senior / Staff Fullstack Engineer",
            location: "Europe",
            workplaceType: "Remote",
            isRemote: true,
            compensation: {
                compensationTierSummary:
                    "$213K – $251K • Offers Equity • This role is also eligible for medical benefits, 401(k) plan, and other company perk programs.",
                summaryComponents: [
                    {
                        compensationType: "Salary",
                        interval: "1 YEAR",
                        currencyCode: "USD",
                        minValue: 213000,
                        maxValue: 251000,
                    },
                    {
                        compensationType: "EquityCashValue",
                        interval: "1 YEAR",
                        currencyCode: "USD",
                        minValue: null,
                        maxValue: null,
                    },
                ],
            },
        },
        {
            id: "a2f0e1aa",
            title: "Product Designer",
            location: "San Francisco",
            workplaceType: "Hybrid",
            isRemote: false,
            compensation: { compensationTierSummary: null },
        },
        // A Canadian range, which is the case the display summary loses: it
        // writes both ends as "CA$", and the letters in that glyph read as
        // prose between two numbers rather than as one range.
        {
            id: "c7d40b19",
            title: "Account Executive",
            location: "Toronto",
            workplaceType: "Onsite",
            isRemote: false,
            compensation: {
                compensationTierSummary:
                    "CA$140K – CA$188K • Offers Equity • Offers Commission • 70/30 split",
                summaryComponents: [
                    {
                        compensationType: "EquityPercentage",
                        interval: "NONE",
                        currencyCode: null,
                        minValue: null,
                        maxValue: null,
                    },
                    {
                        compensationType: "Salary",
                        interval: "1 YEAR",
                        currencyCode: "CAD",
                        minValue: 140000,
                        maxValue: 188000,
                    },
                    {
                        compensationType: "Commission",
                        interval: "1 YEAR",
                        currencyCode: "CAD",
                        minValue: 189000,
                        maxValue: 220500,
                    },
                ],
            },
        },
    ],
};

const answerWith = (body: unknown, status = 200) => {
    const asked: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        asked.push(String(input));
        return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return asked;
};

describe("isDirectlyReadable", () => {
    it("claims the providers that answer one posting at a time", () => {
        expect(
            isDirectlyReadable(
                "https://job-boards.greenhouse.io/anthropic/jobs/5101378008",
            ),
        ).toBeTrue();
        expect(
            isDirectlyReadable("https://jobs.lever.co/palantir/ac978161"),
        ).toBeTrue();
        expect(
            isDirectlyReadable(
                "https://ats.rippling.com/aalyria-careers/jobs/e599291c-b244-4dfc-a1e9-8bb5dcc11f30",
            ),
        ).toBeTrue();
    });

    it("claims a Greenhouse application form embedded on another site", () => {
        expect(
            isDirectlyReadable(
                "https://job-boards.greenhouse.io/embed/job_app?for=anthropic&token=5101378008&jr_id=6aa204852f936e4a53daf36d",
            ),
        ).toBeTrue();
    });

    it("claims Ashby, which answers with a board rather than a posting", () => {
        expect(
            isDirectlyReadable("https://jobs.ashbyhq.com/ramp/abc123"),
        ).toBeTrue();
    });

    it("leaves the rest to the extension and the server", () => {
        // Workday answers without a cross-origin header, on its pages and its
        // own API alike; Simplify keeps the employer link in a redirect a
        // browser may not read; an employer's own site is never ours to fetch.
        for (const url of [
            "https://acme.myworkdayjobs.com/en-US/careers/job/123",
            "https://simplify.jobs/p/123/engineer",
            "https://careers.acme.com/platform-engineer",
            // Rippling's own marketing pages are not a board.
            "https://www.rippling.com/pricing",
            "https://ats.rippling.com/aalyria-careers/jobs",
            "not a url at all",
        ]) {
            expect(isDirectlyReadable(url)).toBeFalse();
        }
    });
});

describe("importDirect", () => {
    it("reads a Greenhouse posting from the board API", async () => {
        const asked = answerWith(GREENHOUSE_JOB);

        const posting = await importDirect(
            "https://job-boards.greenhouse.io/anthropic/jobs/5101378008",
        );

        // Greenhouse leaves the ranges out unless they are asked for by name.
        expect(asked[0]).toBe(
            "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5101378008?pay_transparency=true",
        );
        expect(posting).toMatchObject({
            company: "Anthropic",
            role: "Software Engineer, Infrastructure",
            location: "San Francisco, CA",
            pay: "USD 222800-290000/yr",
            source: "greenhouse",
        });
    });

    it("reads an embedded Greenhouse form, which names the board and job in the query", async () => {
        const asked = answerWith(GREENHOUSE_JOB);

        const posting = await importDirect(
            "https://job-boards.greenhouse.io/embed/job_app?for=anthropic&token=7788990011&jr_id=6aa204852f936e4a53daf36d",
        );

        // `token` is the job the board API answers to. `jr_id` is not.
        expect(asked[0]).toBe(
            "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/7788990011?pay_transparency=true",
        );
        expect(posting).toMatchObject({
            company: "Anthropic",
            role: "Software Engineer, Infrastructure",
            source: "greenhouse",
        });
    });

    it("reads a Lever posting, taking the arrangement it states outright", async () => {
        const asked = answerWith(LEVER_POSTING);

        const posting = await importDirect(
            "https://jobs.lever.co/palantir/ac978161",
        );

        expect(asked[0]).toBe(
            "https://api.lever.co/v0/postings/palantir/ac978161",
        );
        expect(posting).toMatchObject({
            // Lever's payload names the job but not the employer, so the board
            // in the link does.
            company: "Palantir",
            role: "Administrative Business Partner",
            location: "London, United Kingdom",
            arrangement: "hybrid",
            pay: "USD 150000-180000/yr",
            source: "lever",
        });
    });

    it("reads a Rippling posting, including the pay range it publishes", async () => {
        const asked = answerWith(RIPPLING_JOB);

        const posting = await importDirect(
            "https://ats.rippling.com/aalyria-careers/jobs/e599291c-b244-4dfc-a1e9-8bb5dcc11f30",
        );

        expect(asked[0]).toBe(
            "https://api.rippling.com/platform/api/ats/v1/board/aalyria-careers/jobs/e599291c-b244-4dfc-a1e9-8bb5dcc11f30",
        );
        expect(posting).toMatchObject({
            // The employer, not the board. Read any other way these come back
            // as a job at "Rippling Recruiting".
            company: "Aalyria",
            role: "Software Engineer, AI Platform",
            location: "Remote (San Francisco Bay Area)",
            arrangement: "remote",
            pay: "USD 185000-215000/yr",
            source: "rippling",
        });
    });

    it("leaves Rippling pay for the person when the board lists a range per location", async () => {
        answerWith({
            ...RIPPLING_JOB,
            payRangeDetails: [
                { currency: "USD", frequency: "YEAR", rangeStart: 185000 },
                { currency: "USD", frequency: "YEAR", rangeStart: 165000 },
            ],
        });

        const posting = await importDirect(
            "https://ats.rippling.com/aalyria-careers/jobs/a-second-posting",
        );

        expect(posting?.pay).toBeNull();
        expect(posting?.role).toBe("Software Engineer, AI Platform");
    });

    it("picks the pasted posting out of an Ashby board", async () => {
        const asked = answerWith(ASHBY_BOARD);

        const posting = await importDirect(
            "https://jobs.ashbyhq.com/linear/d3bc1ced",
        );

        expect(asked[0]).toBe(
            "https://api.ashbyhq.com/posting-api/job-board/linear?includeCompensation=true",
        );
        expect(posting).toMatchObject({
            company: "Linear",
            role: "Senior / Staff Fullstack Engineer",
            location: "Europe",
            arrangement: "remote",
            // The figures themselves, not the sentence they are printed in.
            pay: "USD 213000-251000/yr",
            // Ashby offers equity as a fact and no amount, which is still worth
            // saying: it is the note the pay field cannot hold.
            payNote: "Equity",
            source: "ashby",
        });
    });

    it("keeps both ends of an Ashby range the display summary would lose", async () => {
        answerWith(ASHBY_BOARD);

        const posting = await importDirect(
            "https://jobs.ashbyhq.com/linear/c7d40b19",
        );

        // "CA$140K – CA$188K" read as text gives up its top end, because the
        // letters in the repeated glyph look like prose between two numbers.
        expect(posting).toMatchObject({
            role: "Account Executive",
            pay: "CAD 140000-188000/yr",
            payNote: "Equity, Commission CAD 189000-220500/yr",
            source: "ashby",
        });
    });

    it("leaves Ashby pay for the person where the board states none", async () => {
        answerWith(ASHBY_BOARD);

        const posting = await importDirect(
            "https://jobs.ashbyhq.com/linear/a2f0e1aa",
        );

        expect(posting).toMatchObject({
            role: "Product Designer",
            arrangement: "hybrid",
            pay: null,
            payNote: null,
        });
    });

    it("downloads a board once however many of its jobs are added", async () => {
        const asked = answerWith(ASHBY_BOARD);

        const first = await importDirect(
            "https://jobs.ashbyhq.com/vanta/d3bc1ced",
        );
        const second = await importDirect(
            "https://jobs.ashbyhq.com/vanta/a2f0e1aa",
        );

        expect(asked).toHaveLength(1);
        expect(first?.role).toBe("Senior / Staff Fullstack Engineer");
        expect(second?.role).toBe("Product Designer");
    });

    it("gives nothing back for a posting the board does not list", async () => {
        answerWith(ASHBY_BOARD);
        expect(
            await importDirect("https://jobs.ashbyhq.com/cursor/not-a-posting"),
        ).toBeNull();
    });

    it("gives nothing back when the posting is gone", async () => {
        answerWith({}, 404);
        expect(
            await importDirect("https://jobs.lever.co/palantir/gone-for-good"),
        ).toBeNull();
    });

    it("gives nothing back when the request cannot be made at all", async () => {
        // What a blocked cross-origin request or a dead network looks like from
        // here, which has to read the same as any other miss.
        globalThis.fetch = (async () => {
            throw new TypeError("Failed to fetch");
        }) as unknown as typeof fetch;

        expect(
            await importDirect(
                "https://job-boards.greenhouse.io/anthropic/jobs/1",
            ),
        ).toBeNull();
    });

    it("asks nothing of a provider it cannot read", async () => {
        const asked = answerWith(GREENHOUSE_JOB);
        expect(
            await importDirect("https://acme.myworkdayjobs.com/job/1"),
        ).toBeNull();
        expect(asked).toBeEmpty();
    });
});
