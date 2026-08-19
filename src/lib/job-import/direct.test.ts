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
    hostedUrl: "https://jobs.lever.co/palantir/ac978161",
};

const GREENHOUSE_JOB = {
    title: "Software Engineer, Infrastructure",
    company_name: "Anthropic",
    location: { name: "San Francisco, CA" },
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

        expect(asked[0]).toBe(
            "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5101378008",
        );
        expect(posting).toMatchObject({
            company: "Anthropic",
            role: "Software Engineer, Infrastructure",
            location: "San Francisco, CA",
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
            // The figures, without the sentence about benefits that follows.
            pay: "$213K – $251K",
            source: "ashby",
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
