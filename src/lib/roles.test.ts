import { describe, expect, it } from "bun:test";
import { searchRoleTitles } from "@/lib/roles";

describe("searchRoleTitles", () => {
    it("offers the common titles before anything is typed", () => {
        const titles = searchRoleTitles("");
        expect(titles).toHaveLength(8);
        expect(titles[0]).toBe("Software Engineer");
        expect(titles).toContain("Product Manager");
    });

    it("finds a title by its shorthand", () => {
        expect(searchRoleTitles("swe")[0]).toBe("Software Engineer");
        expect(searchRoleTitles("pm")[0]).toBe("Product Manager");
        expect(searchRoleTitles("mle")[0]).toBe("Machine Learning Engineer");
    });

    it("forgives a typo", () => {
        expect(searchRoleTitles("prodcut manager")[0]).toBe("Product Manager");
    });

    it("builds a rank onto the role it is written against", () => {
        expect(searchRoleTitles("senior software")[0]).toBe(
            "Senior Software Engineer",
        );
        expect(searchRoleTitles("sr swe")[0]).toBe("Senior Software Engineer");
        expect(searchRoleTitles("staff data engineer")[0]).toBe(
            "Staff Data Engineer",
        );
    });

    it("builds an intern word onto the role it is written against", () => {
        expect(searchRoleTitles("data intern")).toContain(
            "Data Scientist Intern",
        );
        expect(searchRoleTitles("data intern")[0]).toStartWith("Data ");
        expect(searchRoleTitles("product manager co-op")[0]).toBe(
            "Product Manager Co-op",
        );
    });

    it("leads with the written titles when the modifier stands alone", () => {
        expect(searchRoleTitles("intern")[0]).toBe("Software Engineer Intern");
        expect(searchRoleTitles("senior")[0]).toBe("Senior Software Engineer");
    });

    it("takes a modifier that is still being typed", () => {
        expect(searchRoleTitles("princip")[0]).toBe(
            "Principal Software Engineer",
        );
        expect(searchRoleTitles("sen")[0]).toBe("Senior Software Engineer");
        expect(searchRoleTitles("software engineer inte")[0]).toBe(
            "Software Engineer Intern",
        );
    });

    it("waits on a word that more than one modifier could become", () => {
        expect(searchRoleTitles("s")[0]).toBe("Software Engineer");
        expect(searchRoleTitles("st")).not.toContain("Staff Software Engineer");
    });

    it("never says a modifier twice", () => {
        const titles = searchRoleTitles("software engineer intern");
        expect(titles[0]).toBe("Software Engineer Intern");
        expect(
            titles.filter((title) => title === "Software Engineer Intern"),
        ).toHaveLength(1);
        expect(
            titles.some((title) => title.includes("Intern Intern")),
        ).toBeFalse();
        expect(searchRoleTitles("associate product manager")[0]).toBe(
            "Associate Product Manager",
        );
    });

    it("returns nothing for a query no title answers", () => {
        expect(searchRoleTitles("zzqqxv")).toEqual([]);
    });

    it("keeps to the limit it is given", () => {
        expect(searchRoleTitles("engineer", 3)).toHaveLength(3);
        expect(searchRoleTitles("engineer", 0)).toEqual([]);
    });
});
