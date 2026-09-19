import type { Friend, FriendsPage } from "@/db/friends";

// What a press does to the three groups while the server is still answering.
// Named by the friendship rather than the person, since that is all the actions
// behind these buttons take.
export type Answer =
    | { kind: "accept"; friendshipId: string }
    | { kind: "remove"; friendshipId: string };

const without = (rows: Friend[], friendshipId: string): Friend[] =>
    rows.filter((row) => row.friendshipId !== friendshipId);

// Accepting moves a row from Requests received into Friends; declining,
// cancelling and removing all take one out of whichever group holds it.
//
// Both cases are written so that applying them to a page that already reflects
// them changes nothing, because that is what happens once the server answers:
// the fresh page arrives while the transition is still open, and this runs
// again on top of it.
export const answered = (page: FriendsPage, answer: Answer): FriendsPage => {
    if (answer.kind === "remove") {
        return {
            friends: without(page.friends, answer.friendshipId),
            incoming: without(page.incoming, answer.friendshipId),
            outgoing: without(page.outgoing, answer.friendshipId),
        };
    }

    const accepted = page.incoming.find(
        (row) => row.friendshipId === answer.friendshipId,
    );
    if (!accepted) return page;
    return {
        ...page,
        incoming: without(page.incoming, answer.friendshipId),
        // Sorted in by name, which is the order the server sends Friends back
        // in, so the row does not land in one place and then jump to another.
        //
        // Compared by code unit rather than with localeCompare, because the
        // database collates in C.UTF-8: it orders by byte, so a name that
        // starts lowercase sorts after every name that does not. localeCompare
        // ignores case at that level and would file such a row near the top,
        // which the server would then move.
        friends: [...page.friends, accepted].sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        ),
    };
};
