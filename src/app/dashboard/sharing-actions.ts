"use server";

import { revalidatePath } from "next/cache";
import { getRequestSession, getViewAs } from "@/lib/auth";
import { VIEW_ONLY } from "@/lib/view-as";
import {
    acceptFriendRequest as acceptFriendRequestDb,
    listFriends,
    removeFriendship as removeFriendshipDb,
    sendFriendRequest as sendFriendRequestDb,
    userByGithubAccountId,
    type Friend,
} from "@/db/friends";
import {
    createShareLink,
    deleteShareLink,
    getShareState,
    revokeShareLink,
    shareWithFriends as shareWithFriendsDb,
    shareWithPerson as shareWithPersonDb,
    unshareWithPerson as unshareWithPersonDb,
    type ShareLink,
    type ShareState,
} from "@/db/shares";
import { githubAccountId } from "@/lib/github";
import { withinBudget } from "@/db/rate-limit";
import { TOO_MANY_REQUESTS } from "@/lib/limits";
import {
    applicationIdSchema,
    firstIssue,
    githubUsernameSchema,
    linkDurationSchema,
    rowIdSchema,
    type ActionResult,
} from "@/lib/validation";
import { expiryFrom, newShareToken } from "@/lib/share";

const NOT_SIGNED_IN = "You are not signed in." as const;

// What a caller is told when the list, the friend or the link they named is not
// theirs, is not there, or was never shared with them. One sentence for all of
// it, deliberately: an account that answered differently for "not yours" and
// "does not exist" would let anyone map which lists and which people are real.
const GONE = "That is no longer available." as const;

type Writer = { ok: true; userId: string } | { ok: false; error: string };

// Every write below passes through here, so an admin looking at somebody else's
// account can read their friends and their sharing but cannot alter either.
const writingUser = async (): Promise<Writer> => {
    const session = await getRequestSession();
    if (!session) return { ok: false, error: NOT_SIGNED_IN };
    if (await getViewAs()) return { ok: false, error: VIEW_ONLY };
    if (!(await withinBudget(session.user.id, "write"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }
    return { ok: true, userId: session.user.id };
};

// The lists page draws both the account's own lists and the ones shared with it,
// and a friend accepted or dropped changes the second. The dashboard tree is
// revalidated rather than one path, since a shared list shows up in the index
// and on its own page.
const revalidateShared = () => revalidatePath("/dashboard", "layout");

export const sendFriendRequest = async (
    username: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = githubUsernameSchema.safeParse(username);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    // GitHub is asked for the numeric id behind the name, because that is what
    // the sign-in stored and so the only thing a Fern account can be found by.
    const lookup = await githubAccountId(parsed.data);
    if (lookup.status === "unavailable") {
        return {
            ok: false,
            error: "Could not reach GitHub to look that up. Try again shortly.",
        };
    }
    if (lookup.status === "missing") {
        return { ok: false, error: `No GitHub user called ${parsed.data}.` };
    }

    // These two answers are deliberately different, and the difference tells a
    // signed-in caller whether a given GitHub account has signed in to Fern.
    // That is accepted here, unlike everywhere else in this feature, because a
    // typed username is usually a typo and merging the two would send people
    // hunting for a mistake they did not make. What is being confirmed is
    // membership of a public handle, to somebody with an account, at 40 tries
    // per ten seconds. Nothing about the account itself is revealed: not the
    // name, not the picture, not that a request was sent.
    const other = await userByGithubAccountId(lookup.accountId);
    if (!other) {
        return {
            ok: false,
            error: `${parsed.data} does not have a Fern account.`,
        };
    }

    const result = await sendFriendRequestDb(writer.userId, other.id);
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/dashboard/friends");
    return { ok: true };
};

export const acceptFriendRequest = async (
    friendshipId: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = rowIdSchema.safeParse(friendshipId);
    if (!parsed.success) return { ok: false, error: GONE };

    // Scoped to the person asked, inside the update itself, so a request
    // somebody else was sent cannot be accepted by whoever holds its id.
    if (!(await acceptFriendRequestDb(writer.userId, parsed.data))) {
        return { ok: false, error: GONE };
    }

    revalidatePath("/dashboard/friends");
    revalidateShared();
    return { ok: true };
};

// Declining a request, cancelling one, and unfriending. All three remove the
// one row between the two accounts, and either of them may do it.
export const removeFriend = async (
    friendshipId: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = rowIdSchema.safeParse(friendshipId);
    if (!parsed.success) return { ok: false, error: GONE };

    if (!(await removeFriendshipDb(writer.userId, parsed.data))) {
        return { ok: false, error: GONE };
    }

    revalidatePath("/dashboard/friends");
    revalidateShared();
    return { ok: true };
};

export type ShareSheet = { friends: Friend[]; state: ShareState };

// Read when the dialog opens rather than carried by the page, so a list costs
// nothing extra for sharing nobody looked at. The friends come with it because
// the dialog offers them, and one round trip is enough for both. Null for a
// list that is not this account's, which the dialog reports as unavailable.
export const loadShareSheet = async (
    listId: string,
): Promise<ShareSheet | null> => {
    const session = await getRequestSession();
    if (!session || !applicationIdSchema.safeParse(listId).success) return null;

    const [friends, state] = await Promise.all([
        listFriends(session.user.id),
        getShareState(session.user.id, listId),
    ]);
    return state && { friends, state };
};

export const setSharedWithFriends = async (
    listId: string,
    on: boolean,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = applicationIdSchema.safeParse(listId);
    if (!parsed.success || typeof on !== "boolean") {
        return { ok: false, error: GONE };
    }

    const result = await shareWithFriendsDb(writer.userId, parsed.data, on);
    if (!result.ok) return result;

    revalidateShared();
    return { ok: true };
};

export const shareWithPerson = async (
    listId: string,
    granteeId: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const list = applicationIdSchema.safeParse(listId);
    // The grantee is a better-auth user id, which is an opaque string rather
    // than a uuid, so it is bounded rather than shaped. Whether it names a real
    // account, and one this user is friends with, is settled by the insert.
    if (!list.success || !granteeId || granteeId.length > 255) {
        return { ok: false, error: GONE };
    }

    const result = await shareWithPersonDb(writer.userId, list.data, granteeId);
    if (!result.ok) return result;

    revalidateShared();
    return { ok: true };
};

export const unshareWithPerson = async (
    listId: string,
    granteeId: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const list = applicationIdSchema.safeParse(listId);
    if (!list.success || !granteeId || granteeId.length > 255) {
        return { ok: false, error: GONE };
    }

    if (!(await unshareWithPersonDb(writer.userId, list.data, granteeId))) {
        return { ok: false, error: GONE };
    }
    revalidateShared();
    return { ok: true };
};

export const createLink = async (
    listId: string,
    duration: string,
): Promise<{ ok: true; link: ShareLink } | { ok: false; error: string }> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const list = applicationIdSchema.safeParse(listId);
    if (!list.success) return { ok: false, error: GONE };

    const parsed = linkDurationSchema.safeParse(duration);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    // The token is made here rather than by the browser. It is the whole of the
    // link's authorisation, so what it is made of must not be a caller's choice.
    return createShareLink(
        writer.userId,
        list.data,
        newShareToken(),
        expiryFrom(parsed.data),
    );
};

export const revokeLink = async (linkId: string): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = rowIdSchema.safeParse(linkId);
    if (!parsed.success) return { ok: false, error: GONE };

    // Said rather than swallowed: the dialog crosses the link out on the press,
    // and a revoke that did not land has to put it back rather than leave
    // somebody believing a live link is dead.
    if (!(await revokeShareLink(writer.userId, parsed.data))) {
        return { ok: false, error: GONE };
    }
    return { ok: true };
};

// Removes the row a revoked or lapsed link left behind. The link itself stopped
// working when it was revoked or when its date passed, so this only tidies the
// dialog.
export const removeLink = async (linkId: string): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = rowIdSchema.safeParse(linkId);
    if (!parsed.success) return { ok: false, error: GONE };

    if (!(await deleteShareLink(writer.userId, parsed.data))) {
        return { ok: false, error: GONE };
    }
    return { ok: true };
};
