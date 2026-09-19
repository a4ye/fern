import { getPool, withTransaction } from "@/db/client";
import * as gen from "@/db/gen/friends_sql";
import {
    MAX_FRIENDS,
    MAX_FRIEND_REQUESTS_SENT,
    MAX_FRIEND_ROWS_READ,
} from "@/lib/limits";

// A person as the friends page draws them: the name and picture their sign-in
// carries. No email and no username, since neither is needed to recognise
// somebody you chose to add and both say more about them than the page has any
// reason to.
export type Person = {
    id: string;
    name: string;
    image: string | null;
};

// `id` is the friendship row, which is what accepting, declining and removing
// all act on, so the buttons never have to name a person to the server.
export type Friend = Person & { friendshipId: string };

export type FriendsPage = {
    friends: Friend[];
    incoming: Friend[];
    outgoing: Friend[];
};

// The friend in a row is whichever of the pair is not the reader, which the
// query has already worked out. It comes back nullable only because that is
// what a case expression is typed as, so a row without one is dropped.
const toFriends = (
    rows: {
        id: string;
        friendId: string | null;
        friendName: string;
        friendImage: string | null;
    }[],
): Friend[] =>
    rows.flatMap((row) =>
        row.friendId
            ? [
                  {
                      friendshipId: row.id,
                      id: row.friendId,
                      name: row.friendName,
                      image: row.friendImage,
                  },
              ]
            : [],
    );

export const getFriendsPage = async (userId: string): Promise<FriendsPage> => {
    const pool = getPool();
    const maxRows = MAX_FRIEND_ROWS_READ;
    const [friends, incoming, outgoing] = await Promise.all([
        gen.listFriends(pool, { userId, maxRows }),
        gen.listIncomingRequests(pool, { userId, maxRows }),
        gen.listOutgoingRequests(pool, { userId, maxRows }),
    ]);

    return {
        friends: toFriends(friends),
        incoming: toFriends(incoming),
        outgoing: toFriends(outgoing),
    };
};

// How many requests are waiting on this user to answer. Drawn on the friends
// icon in the top bar, which is on every dashboard page, so it is a count rather
// than the rows themselves.
export const countIncomingRequests = async (userId: string): Promise<number> =>
    (await gen.countFriendships(getPool(), { userId }))?.received ?? 0;

export const listFriends = async (userId: string): Promise<Friend[]> =>
    toFriends(
        await gen.listFriends(getPool(), {
            userId,
            maxRows: MAX_FRIEND_ROWS_READ,
        }),
    );

export const githubAccountIdForUser = async (
    userId: string,
): Promise<string | null> =>
    (await gen.githubAccountIdForUser(getPool(), { userId }))?.accountid ??
    null;

export const userByGithubAccountId = async (
    accountId: string,
): Promise<Person | null> => {
    const row = await gen.userByGithubAccountId(getPool(), { accountId });
    return row && { id: row.id, name: row.name, image: row.image };
};

// Sends a request, or explains why there is nothing to send. Every refusal here
// is about a row that already exists between these two, which is why they are
// worked out before the insert rather than read back off a failed one: "you are
// already friends" is a different sentence from "that did not work".
export const sendFriendRequest = async (
    userId: string,
    otherId: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (userId === otherId) {
        return { ok: false, error: "That is your own account." };
    }

    const pool = getPool();
    const [existing, counts] = await Promise.all([
        gen.friendshipBetween(pool, { userId, otherId }),
        gen.countFriendships(pool, { userId }),
    ]);

    if (existing?.status === "accepted") {
        return { ok: false, error: "You are already friends." };
    }
    if (existing?.status === "pending") {
        return {
            ok: false,
            error:
                existing.requesterId === userId
                    ? "You have already sent them a request."
                    : "They have already sent you a request. Answer it below.",
        };
    }

    if ((counts?.friends ?? 0) >= MAX_FRIENDS) {
        return {
            ok: false,
            error: `You can keep ${MAX_FRIENDS} friends. Remove one to make room.`,
        };
    }
    if ((counts?.sent ?? 0) >= MAX_FRIEND_REQUESTS_SENT) {
        return {
            ok: false,
            error: `You have ${MAX_FRIEND_REQUESTS_SENT} requests waiting for an answer, which is as many as you can have out at once.`,
        };
    }

    // The unique index is what actually settles two people asking each other in
    // the same moment. Nothing coming back means it did, and the row that won is
    // a friendship either way round.
    const created = await gen.createFriendRequest(pool, {
        requesterId: userId,
        addresseeId: otherId,
    });
    return created
        ? { ok: true }
        : { ok: false, error: "There is already a request between you." };
};

// False when there was no such request to accept, and also when accepting it
// would put this account over the ceiling. The two are not told apart because
// the caller says the same thing for both, and the count is inside the update
// rather than read before it.
export const acceptFriendRequest = async (
    userId: string,
    friendshipId: string,
): Promise<boolean> =>
    (await gen.acceptFriendRequest(getPool(), {
        id: friendshipId,
        userId,
        maxFriends: MAX_FRIENDS,
    })) !== null;

// Declining, cancelling and unfriending are all this. The grants the two made
// each other go with the row, in one transaction, so the friendship cannot go
// without them.
//
// The grants are not what enforces the access, though. A read of a shared list
// requires an accepted friendship whether it was shared by name or through the
// standing rule, so a grant that somehow survived its friendship opens nothing.
// This keeps the rows honest; SharedListForViewer is what keeps the list shut.
export const removeFriendship = async (
    userId: string,
    friendshipId: string,
): Promise<boolean> =>
    withTransaction(async (client) => {
        const removed = await gen.deleteFriendship(client, {
            id: friendshipId,
            userId,
        });
        if (!removed?.otherId) return false;

        await gen.deleteSharesBetween(client, {
            userId,
            otherId: removed.otherId,
        });
        return true;
    });
