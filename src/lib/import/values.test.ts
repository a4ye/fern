import { describe, expect, test } from "bun:test";
import {
    detectDateOrder,
    matchArrangement,
    matchStatus,
    parseDay,
} from "@/lib/import/values";

describe("status matching", () => {
    test("reads the labels this app writes", () => {
        expect(matchStatus("Online assessment")).toBe("online_assessment");
        expect(matchStatus("Offer accepted")).toBe("offer_accepted");
    });

    test("reads what people actually type in a sheet", () => {
        expect(matchStatus("OA")).toBe("online_assessment");
        expect(matchStatus("phone screen")).toBe("interviewing");
        expect(matchStatus("no response")).toBe("ghosted");
        expect(matchStatus("Final round")).toBe("onsite");
        expect(matchStatus("signed")).toBe("offer_accepted");
        expect(matchStatus("turned it down")).toBe("offer_declined");
    });

    test("is not thrown by case or trailing punctuation", () => {
        expect(matchStatus("  REJECTED  ")).toBe("rejected");
        expect(matchStatus("Interviewing!")).toBe("interviewing");
    });

    test("leaves a value it cannot place for the user to settle", () => {
        expect(matchStatus("")).toBeNull();
        expect(matchStatus("waiting on my referral to go through")).toBeNull();
    });
});

describe("arrangement matching", () => {
    test("reads the usual ways of writing each one", () => {
        expect(matchArrangement("Remote")).toBe("remote");
        expect(matchArrangement("WFH")).toBe("remote");
        expect(matchArrangement("work from home")).toBe("remote");
        expect(matchArrangement("Hybrid")).toBe("hybrid");
        expect(matchArrangement("In office")).toBe("onsite");
        expect(matchArrangement("On-site")).toBe("onsite");
    });

    test("leaves anything else unset", () => {
        expect(matchArrangement("")).toBeNull();
        expect(matchArrangement("Tuesdays and Thursdays")).toBeNull();
    });
});

describe("date order", () => {
    test("takes a leading part above twelve as day first", () => {
        expect(detectDateOrder(["05/03/2026", "19/03/2026"])).toBe("dmy");
    });

    test("takes a second part above twelve as month first", () => {
        expect(detectDateOrder(["03/19/2026", "05/03/2026"])).toBe("mdy");
    });

    test("falls to month first when every row reads either way", () => {
        expect(detectDateOrder(["05/03/2026", "01/02/2026"])).toBe("mdy");
    });

    test("ignores a leading four-digit year, which settles nothing", () => {
        expect(detectDateOrder(["2026-03-19", "05/03/2026"])).toBe("mdy");
    });
});

describe("parsing a day", () => {
    test("reads an ISO day whatever the order says", () => {
        expect(parseDay("2026-03-05", "dmy")).toBe("2026-03-05");
        expect(parseDay("2026-3-5")).toBe("2026-03-05");
    });

    test("reads a slashed day the way the column was written", () => {
        expect(parseDay("03/05/2026", "mdy")).toBe("2026-03-05");
        expect(parseDay("03/05/2026", "dmy")).toBe("2026-05-03");
    });

    test("takes dots and dashes as well as slashes", () => {
        expect(parseDay("5.3.2026", "dmy")).toBe("2026-03-05");
        expect(parseDay("3-5-2026", "mdy")).toBe("2026-03-05");
    });

    test("reads a written month either way round", () => {
        expect(parseDay("March 5, 2026")).toBe("2026-03-05");
        expect(parseDay("Mar 5 2026")).toBe("2026-03-05");
        expect(parseDay("5 March 2026")).toBe("2026-03-05");
        expect(parseDay("5th Mar 2026")).toBe("2026-03-05");
    });

    test("gives a two-digit year this century up to the sixties", () => {
        expect(parseDay("03/05/26", "mdy")).toBe("2026-03-05");
        expect(parseDay("03/05/99", "mdy")).toBe("1999-03-05");
    });

    test("refuses a day the calendar does not have", () => {
        // Rolling this into 1 March would record a day nobody applied on.
        expect(parseDay("2026-02-31")).toBeNull();
        expect(parseDay("13/05/2026", "mdy")).toBeNull();
    });

    test("returns null for a cell that is not a date at all", () => {
        expect(parseDay("")).toBeNull();
        expect(parseDay("last tuesday")).toBeNull();
        expect(parseDay("ASAP")).toBeNull();
    });
});
