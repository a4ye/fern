import { describe, expect, it } from "bun:test";
import { answered } from "@/components/friends/answered";
import type { Friend, FriendsPage } from "@/db/friends";

const person = (name: string): Friend => ({
    friendshipId: `f-${name}`,
    id: `u-${name}`,
    name,
    image: null,
});

const page: FriendsPage = {
    friends: [person("Ada"), person("Cyrus")],
    incoming: [person("Brigid"), person("Zenia")],
    outgoing: [person("Devon")],
};

const names = (rows: Friend[]): string[] => rows.map((row) => row.name);

describe("answered", () => {
    it("moves an accepted request into friends, in name order", () => {
        const next = answered(page, {
            kind: "accept",
            friendshipId: "f-Brigid",
        });
        expect(names(next.friends)).toEqual(["Ada", "Brigid", "Cyrus"]);
        expect(names(next.incoming)).toEqual(["Zenia"]);
        expect(names(next.outgoing)).toEqual(["Devon"]);
    });

    // The database collates in C.UTF-8, so "dede" follows every capitalised
    // name rather than sitting under D. Sorting the other way would file the
    // row near the top and let the server's answer move it.
    it("orders a lowercase name the way the database does", () => {
        const lower: FriendsPage = {
            friends: [person("Ada"), person("Devon")],
            incoming: [person("dede")],
            outgoing: [],
        };
        expect(
            names(
                answered(lower, { kind: "accept", friendshipId: "f-dede" })
                    .friends,
            ),
        ).toEqual(["Ada", "Devon", "dede"]);
    });

    it("takes a removed row out of whichever group held it", () => {
        expect(
            names(
                answered(page, { kind: "remove", friendshipId: "f-Ada" })
                    .friends,
            ),
        ).toEqual(["Cyrus"]);
        expect(
            names(
                answered(page, { kind: "remove", friendshipId: "f-Zenia" })
                    .incoming,
            ),
        ).toEqual(["Brigid"]);
        expect(
            names(
                answered(page, { kind: "remove", friendshipId: "f-Devon" })
                    .outgoing,
            ),
        ).toEqual([]);
    });

    // The server's answer arrives while the transition is still open, so each
    // press is applied a second time on top of a page that already reflects it.
    // Neither case may double up or undo itself when that happens.
    it("changes nothing when applied to a page that already reflects it", () => {
        const accept = { kind: "accept", friendshipId: "f-Brigid" } as const;
        const once = answered(page, accept);
        expect(answered(once, accept)).toEqual(once);

        const remove = { kind: "remove", friendshipId: "f-Ada" } as const;
        const dropped = answered(page, remove);
        expect(answered(dropped, remove)).toEqual(dropped);
    });

    it("leaves the page alone when the row is already gone", () => {
        const gone = { kind: "accept", friendshipId: "f-nobody" } as const;
        expect(answered(page, gone)).toEqual(page);
    });

    it("does not alter the page it was given", () => {
        answered(page, { kind: "accept", friendshipId: "f-Brigid" });
        answered(page, { kind: "remove", friendshipId: "f-Ada" });
        expect(names(page.friends)).toEqual(["Ada", "Cyrus"]);
        expect(names(page.incoming)).toEqual(["Brigid", "Zenia"]);
    });
});
