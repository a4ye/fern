import { describe, expect, it } from "bun:test";
import { parsePosting } from "@/lib/job-scrape";
import { parsePay } from "@/lib/pay";

const jsonLd = (posting: Record<string, unknown>) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head></html>`;

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
});
