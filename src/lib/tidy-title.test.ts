import { describe, expect, it } from "bun:test";
import { tidyRoleTitle } from "@/lib/tidy-title";

describe("tidyRoleTitle", () => {
    describe("when the job runs", () => {
        it("drops a trailing season and year", () => {
            expect(
                tidyRoleTitle("Software Engineering Internships Winter 2027"),
            ).toBe("Software Engineer Intern");
        });

        it("drops a leading season and year", () => {
            expect(
                tidyRoleTitle("Winter 2027 Software Engineering Intern"),
            ).toBe("Software Engineer Intern");
            expect(tidyRoleTitle("Fall 2026 Software Engineering Intern")).toBe(
                "Software Engineer Intern",
            );
        });

        it("drops a bracketed term", () => {
            expect(
                tidyRoleTitle("Software Engineering Intern (Summer 2027)"),
            ).toBe("Software Engineer Intern");
            expect(tidyRoleTitle("Software Engineer Intern (2026)")).toBe(
                "Software Engineer Intern",
            );
        });

        it("drops a season written after the year", () => {
            expect(
                tidyRoleTitle(
                    "Product Solutions and Operations Intern (Commerce Ads) - 2027 Summer",
                ),
            ).toBe("Product Solutions and Operations Intern (Commerce Ads)");
        });

        it("drops a bare season standing next to an intern word", () => {
            expect(tidyRoleTitle("Software Engineer Summer Intern")).toBe(
                "Software Engineer Intern",
            );
        });

        // "Spring" is as likely to be the framework as the term, so it only
        // counts as a term when the title says the job is an internship.
        it("keeps a season that could be the technology", () => {
            expect(tidyRoleTitle("Spring Boot Developer")).toBe(
                "Spring Boot Developer",
            );
        });

        it("drops the length of a co-op term", () => {
            expect(
                tidyRoleTitle(
                    "Software Developer I – 4 Month Co-op/Internship",
                ),
            ).toBe("Software Developer I Intern");
        });
    });

    // Every case below came out of the 14k Simplify/Pitt CSC listings, which is
    // where the shapes a careers page actually writes dates in showed up.
    describe("dates as a posting really writes them", () => {
        it("reads a month against a year as a date", () => {
            expect(
                tidyRoleTitle(
                    "Co-op May 2026 - Software Engineering - 4-Months",
                ),
            ).toBe("Software Engineering Co-op");
        });

        it("reads a run of terms as one date", () => {
            expect(
                tidyRoleTitle(
                    "Digital Patient Experience Analytics Summer-Fall 2026 Co-op",
                ),
            ).toBe("Digital Patient Experience Analytics Co-op");
            expect(
                tidyRoleTitle("Data Science Intern - May to December 2026"),
            ).toBe("Data Science Intern");
        });

        it("takes both numbers of a two-length term", () => {
            expect(
                tidyRoleTitle("Hardware Engineer Co-op - 4 or 8 Months"),
            ).toBe("Hardware Engineer Co-op");
        });

        // A dash there separates the level from the term rather than joining
        // two lengths, so the level has to survive it.
        it("keeps a level standing in front of a term length", () => {
            expect(
                tidyRoleTitle(
                    "Software Developer 1 – 4 Month Co-op/Internship - Summer 2026",
                ),
            ).toBe("Software Developer 1 Intern");
        });

        it("leaves a year that a word is hyphenated onto", () => {
            expect(
                tidyRoleTitle("Statistician Internship - Start mid-2026"),
            ).toBe("Statistician Intern - Start mid-2026");
            expect(tidyRoleTitle("Application Development-Summer Intern")).toBe(
                "Application Development-Summer Intern",
            );
        });
    });

    describe("numbers", () => {
        it("drops a requisition number written in front", () => {
            expect(tidyRoleTitle("016:Summer Intern - Data Analytics")).toBe(
                "Data Analytics Intern",
            );
        });

        // The same digits behind the role are a level or the top of a range.
        it("keeps a number written behind the role", () => {
            expect(tidyRoleTitle("Application Developer Levels 1 - 5")).toBe(
                "Application Developer Levels 1 - 5",
            );
            expect(tidyRoleTitle("Graduate Intern - 3")).toBe(
                "Graduate Intern - 3",
            );
        });
    });

    describe("what is left after a clause is cut out", () => {
        it("gives a separator back the space the cut clause took", () => {
            expect(
                tidyRoleTitle(
                    "Intern – Software Development - 8 months - Hybrid Ottawa",
                ),
            ).toBe("Software Development - Hybrid Ottawa Intern");
        });

        it("does not put spaces inside a hyphenated word", () => {
            expect(tidyRoleTitle("Full-Stack Engineer Intern")).toBe(
                "Full-Stack Engineer Intern",
            );
            expect(tidyRoleTitle("Software Developer - C++ (Co-op)")).toBe(
                "Software Developer - C++ Co-op",
            );
        });
    });

    describe("what the posting was advertised under", () => {
        it("drops a programme segment", () => {
            expect(
                tidyRoleTitle(
                    "Software Engineer: Intern Opportunity for University Students",
                ),
            ).toBe("Software Engineer Intern");
            expect(
                tidyRoleTitle(
                    "Explore Program Internship Opportunities: First-Year Students",
                ),
            ).toBe("Explore Program Intern: First-Year Students");
        });

        // Touching the intern word is what makes the advertising safe to cut.
        it("drops an opening that restates the internship beside it", () => {
            expect(
                tidyRoleTitle("Internship Opportunities, Data Science"),
            ).toBe("Data Science Intern");
            expect(tidyRoleTitle("Equal Opportunity Officer")).toBe(
                "Equal Opportunity Officer",
            );
            expect(tidyRoleTitle("Equal Opportunity Specialist Intern")).toBe(
                "Equal Opportunity Specialist Intern",
            );
        });

        // A phrase, not a word. "Student Opportunities" is never what a job is
        // called, whereas "Student" and "Opportunity" on their own are.
        it("drops a phrase that only advertises to students", () => {
            expect(
                tidyRoleTitle(
                    "Summer Student Opportunities Capital Markets, QTS - Software Developer",
                ),
            ).toBe("Capital Markets, QTS - Software Developer");
            expect(tidyRoleTitle("Student Success Manager")).toBe(
                "Student Success Manager",
            );
        });

        // A clause is only cut when it says nothing but "this is an
        // internship". A word on a list is never enough on its own, or every
        // Program Manager in the world would lose the half of the title that
        // says what they manage.
        it("keeps a clause that names the work rather than the programme", () => {
            expect(tidyRoleTitle("Director, Student Programs")).toBe(
                "Director, Student Programs",
            );
            expect(tidyRoleTitle("Data Analyst Intern - Recruiting")).toBe(
                "Data Analyst Intern - Recruiting",
            );
            expect(tidyRoleTitle("Explore Program Internship")).toBe(
                "Explore Program Intern",
            );
        });

        it("drops the employer's own name when it is given", () => {
            expect(
                tidyRoleTitle(
                    "[Summer 2027] Software Engineer Intern | Roblox",
                    "Roblox",
                ),
            ).toBe("Software Engineer Intern");
            expect(
                tidyRoleTitle(
                    "Splunk - Frontend - Software Engineer II (Intern)",
                    "Splunk",
                ),
            ).toBe("Frontend - Software Engineer II Intern");
        });

        // Only an exact match goes, so a role that merely opens with the same
        // letters as the employer is never cut short.
        it("keeps a segment that only resembles the employer's name", () => {
            expect(tidyRoleTitle("Metabolic Engineer Intern", "Meta")).toBe(
                "Metabolic Engineer Intern",
            );
        });
    });

    describe("the word for the job", () => {
        it("settles on one spelling of intern", () => {
            expect(tidyRoleTitle("Machine Learning Internship")).toBe(
                "Machine Learning Intern",
            );
            expect(tidyRoleTitle("Full Stack Software Engineer INTERN")).toBe(
                "Full Stack Software Engineer Intern",
            );
            expect(
                tidyRoleTitle("Software Development Engineer Internship"),
            ).toBe("Software Development Engineer Intern");
        });

        it("moves a leading intern segment to the end", () => {
            expect(tidyRoleTitle("Intern, Software Developer")).toBe(
                "Software Developer Intern",
            );
            expect(
                tidyRoleTitle("Internship, Software Development Engineer"),
            ).toBe("Software Development Engineer Intern");
            expect(tidyRoleTitle("Intern - Software")).toBe("Software Intern");
        });

        it("joins an intern segment onto the role it belongs to", () => {
            expect(
                tidyRoleTitle(
                    "Quantitative Developer - Internship - Summer 2027",
                ),
            ).toBe("Quantitative Developer Intern");
            expect(tidyRoleTitle("Software Engineer - Internship")).toBe(
                "Software Engineer Intern",
            );
            expect(tidyRoleTitle("Software Engineer, Intern")).toBe(
                "Software Engineer Intern",
            );
        });

        it("names the role rather than the discipline before an intern word", () => {
            expect(tidyRoleTitle("Analytics Engineering Intern")).toBe(
                "Analytics Engineer Intern",
            );
            expect(tidyRoleTitle("Software Engineering Co-op")).toBe(
                "Software Engineer Co-op",
            );
        });

        // Unqualified, "Engineering Intern" is how the job is usually written,
        // and "Engineer Intern" would be the stranger of the two.
        it("leaves an unqualified discipline alone", () => {
            expect(tidyRoleTitle("Engineering Intern")).toBe(
                "Engineering Intern",
            );
        });

        it("leaves a field that only looks like a discipline", () => {
            expect(tidyRoleTitle("Business Development Intern")).toBe(
                "Business Development Intern",
            );
        });

        it("keeps co-op where that is the only word the posting used", () => {
            expect(tidyRoleTitle("Software Engineer – Backend Co-op")).toBe(
                "Software Engineer – Backend Co-op",
            );
            expect(tidyRoleTitle("Software Developer - C++ (Co-op)")).toBe(
                "Software Developer - C++ Co-op",
            );
        });
    });

    describe("what has to survive", () => {
        it("keeps seniority", () => {
            expect(
                tidyRoleTitle("Junior Software Developer, Summer 2026"),
            ).toBe("Junior Software Developer");
            expect(tidyRoleTitle("Senior Software Engineer")).toBe(
                "Senior Software Engineer",
            );
            expect(
                tidyRoleTitle("Staff Machine Learning Engineer Summer 2027"),
            ).toBe("Staff Machine Learning Engineer");
        });

        it("keeps the level", () => {
            expect(tidyRoleTitle("Software Engineer Intern II")).toBe(
                "Software Engineer Intern II",
            );
            expect(
                tidyRoleTitle(
                    "Summer Intern: Software Engineering II (Bentonville)",
                ),
            ).toBe("Software Engineering II (Bentonville) Intern");
        });

        it("keeps the team or product named in brackets", () => {
            expect(tidyRoleTitle("Software Engineer Intern (First Play)")).toBe(
                "Software Engineer Intern (First Play)",
            );
            expect(
                tidyRoleTitle("Software Engineering Intern (Full Stack)"),
            ).toBe("Software Engineer Intern (Full Stack)");
        });

        it("keeps a hyphenated word whole", () => {
            expect(tidyRoleTitle("Full-Stack Engineer Intern")).toBe(
                "Full-Stack Engineer Intern",
            );
            expect(tidyRoleTitle("Self-Built Engineer Intern")).toBe(
                "Self-Built Engineer Intern",
            );
        });

        it("keeps a graduate role, which is not an internship", () => {
            expect(tidyRoleTitle("Software Engineer, New Grad")).toBe(
                "Software Engineer, New Grad",
            );
        });
    });

    // Every title here is a real job somewhere, built out of the same words a
    // careers page pads an internship listing with. They are the reason this
    // module cuts clauses and dates rather than words off a list.
    describe("roles outside software that reuse the noise words", () => {
        it.each([
            "Program Manager Intern",
            "Intern Program Manager",
            "Application Engineer Intern",
            "Applications Developer Co-op",
            "Student Success Manager Intern",
            "Career Coach Intern",
            "College Advisor Intern",
            "Campus Safety Officer Intern",
            "Recruiting Coordinator Intern",
            "Coordinator, Campus Recruiting",
            "Fall Protection Engineer Intern",
            "Fall Risk Nurse Intern",
            "Summer Camp Counselor Intern",
            "Spring Boot Developer Intern",
            "Early Childhood Educator Intern",
            "Student Affairs Coordinator Intern",
            "Windows 2000 Administrator",
            "Registered Nurse",
            "Assistant Professor of Physics",
            "Investment Banking Analyst",
            "Senior Counsel, Privacy",
            "Warehouse Associate II",
        ])("leaves %s alone", (title) => {
            expect(tidyRoleTitle(title)).toBe(title);
        });
    });

    describe("when there is nothing to do", () => {
        it("hands back a title that is already clean", () => {
            for (const title of [
                "Software Engineer Intern",
                "Backend Engineer Intern",
                "Machine Learning Engineer",
                "Site Reliability Engineer III",
                "Data Scientist",
            ]) {
                expect(tidyRoleTitle(title)).toBe(title);
            }
        });

        it("hands back a title made only of words it cannot name", () => {
            expect(tidyRoleTitle("Tech Design - Sledgehammer Games")).toBe(
                "Tech Design - Sledgehammer Games",
            );
        });

        // Cutting every segment would leave the row with no role at all, which
        // is worse than the noisy title the posting came with.
        it("hands back the original rather than nothing", () => {
            expect(tidyRoleTitle("Summer 2027 Internship Program")).toBe(
                "Summer 2027 Internship Program",
            );
            expect(tidyRoleTitle("   ")).toBe("");
        });
    });
});
