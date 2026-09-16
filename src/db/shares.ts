import { getPool } from "@/db/client";
import * as gen from "@/db/gen/shares_sql";
import { listStats, toApplicationRow } from "@/db/dashboard";
import type { Person } from "@/db/friends";
import type { ApplicationRow, Stat } from "@/components/dashboard/data";
import { applicationIdSchema } from "@/lib/validation";
import {
    MAX_APPLICATIONS_READ_PER_LIST,
    MAX_LINKS_PER_LIST,
    MAX_SHARES_PER_LIST,
    MAX_SHARED_LISTS_READ,
} from "@/lib/limits";

export type ShareLink = {
    id: string;
    token: string;
    expiresAt: string | null;
    revokedAt: string | null;
    viewCount: number;
    createdAt: string;
};

// Who a list reaches. `sharedWithFriends` is not a list of people but a standing
// rule, answered against the friendships that exist when the list is opened, so
// it covers a friend added after the sharing and drops one removed since.
export type ShareState = {
    sharedWithFriends: boolean;
    people: Person[];
    links: ShareLink[];
};

// Null for a list this account did not write. The two reads below are already
// scoped to the owner and would simply come back empty, but empty and "not
// yours" are different answers and the dialog must not open on the second
// wearing the face of the first.
export const getShareState = async (
    userId: string,
    listId: string,
): Promise<ShareState | null> => {
    const pool = getPool();
    const [owned, shares, links] = await Promise.all([
        gen.countSharesForList(pool, { listId, userId }),
        gen.listSharesForList(pool, { listId, userId }),
        gen.listLinksForList(pool, { listId, userId }),
    ]);
    if (!owned) return null;

    return {
        sharedWithFriends: shares.some((row) => row.audience === "friends"),
        people: shares.flatMap((row) =>
            row.granteeId && row.granteeName
                ? [
                      {
                          id: row.granteeId,
                          name: row.granteeName,
                          image: row.granteeImage,
                      },
                  ]
                : [],
        ),
        links: links.map((row) => ({
            id: row.id,
            token: row.token,
            expiresAt: row.expiresAt?.toISOString() ?? null,
            revokedAt: row.revokedAt?.toISOString() ?? null,
            viewCount: row.viewCount,
            createdAt: row.createdAt.toISOString(),
        })),
    };
};

type Outcome = { ok: true } | { ok: false; error: string };

const GONE = "That list is no longer available." as const;

// How much of each ceiling is already spent, or null for a list this account
// did not write. The count is scoped to the owner, so it doubles as the
// ownership check every write below starts from, and the writes themselves are
// scoped again in SQL rather than trusting this.
const roomFor = async (
    userId: string,
    listId: string,
): Promise<{ shares: boolean; links: boolean } | null> => {
    const counts = await gen.countSharesForList(getPool(), { listId, userId });
    return (
        counts && {
            shares: counts.shares < MAX_SHARES_PER_LIST,
            links: counts.links < MAX_LINKS_PER_LIST,
        }
    );
};

const FULL = `A list can be shared ${MAX_SHARES_PER_LIST} ways. Remove one to make room.`;

export const shareWithFriends = async (
    userId: string,
    listId: string,
    on: boolean,
): Promise<Outcome> => {
    // Ownership is settled first for both directions, since turning the rule
    // off deletes nothing when it was already off and that is indistinguishable
    // from deleting nothing because the list belongs to somebody else. Both
    // statements are scoped by owner again in SQL; this decides what to say.
    const room = await roomFor(userId, listId);
    if (!room) return { ok: false, error: GONE };

    const pool = getPool();
    if (!on) {
        await gen.unshareListWithFriends(pool, { listId, userId });
        return { ok: true };
    }

    if (!room.shares) return { ok: false, error: FULL };
    await gen.shareListWithFriends(pool, { listId, userId });
    return { ok: true };
};

// The insert carries both conditions itself: the list is this user's, and the
// person named is an accepted friend. Nothing coming back means one of those
// was false, and the caller is not told which, since a stranger's account is
// not something a caller gets to confirm the existence of.
export const shareWithPerson = async (
    userId: string,
    listId: string,
    granteeId: string,
): Promise<Outcome> => {
    const room = await roomFor(userId, listId);
    if (!room) return { ok: false, error: GONE };
    if (!room.shares) return { ok: false, error: FULL };

    const created = await gen.shareListWithPerson(getPool(), {
        listId,
        userId,
        granteeId,
    });
    // Nothing came back, which is the insert's way of saying one of its two
    // conditions was false. Ownership was settled above, so what is left is
    // that they are not a friend or the grant is already there. The message
    // does not guess between them: it says the sharing did not change.
    return created
        ? { ok: true }
        : {
              ok: false,
              error: "They already have it, or are no longer a friend.",
          };
};

// Reports whether the grant actually went. The dialog drops the row on the
// press, and a removal that did not land leaves somebody still able to read the
// list while the screen says otherwise.
export const unshareWithPerson = async (
    userId: string,
    listId: string,
    granteeId: string,
): Promise<boolean> =>
    (await gen.unshareListWithPerson(getPool(), {
        listId,
        userId,
        granteeId,
    })) !== null;

export const createShareLink = async (
    userId: string,
    listId: string,
    token: string,
    expiresAt: Date | null,
): Promise<{ ok: true; link: ShareLink } | { ok: false; error: string }> => {
    const room = await roomFor(userId, listId);
    if (!room) return { ok: false, error: GONE };
    if (!room.links) {
        return {
            ok: false,
            error: `A list can have ${MAX_LINKS_PER_LIST} links. Remove one to make room.`,
        };
    }

    const row = await gen.createListLink(getPool(), {
        listId,
        userId,
        token,
        expiresAt,
    });
    if (!row) return { ok: false, error: GONE };

    return {
        ok: true,
        link: {
            id: row.id,
            token: row.token,
            expiresAt: row.expiresAt?.toISOString() ?? null,
            revokedAt: row.revokedAt?.toISOString() ?? null,
            viewCount: row.viewCount,
            createdAt: row.createdAt.toISOString(),
        },
    };
};

export const revokeShareLink = async (
    userId: string,
    linkId: string,
): Promise<boolean> =>
    (await gen.revokeListLink(getPool(), { id: linkId, userId })) !== null;

export const deleteShareLink = async (
    userId: string,
    linkId: string,
): Promise<boolean> =>
    (await gen.deleteListLink(getPool(), { id: linkId, userId })) !== null;

// A list as somebody who did not write it sees it. The owner travels with it
// because the page has to say whose work this is, and `expiresAt` because a
// link with an end on it should say so rather than stop working unannounced.
export type SharedList = {
    id: string;
    name: string;
    description: string | null;
    owner: Person;
    expiresAt: string | null;
    stats: Stat[];
    applications: ApplicationRow[];
};

const withApplications = async (
    list: {
        id: string;
        name: string;
        description: string | null;
        ownerId: string;
        ownerName: string;
        ownerImage: string | null;
    },
    expiresAt: Date | null,
): Promise<SharedList> => {
    const rows = await gen.applicationsForSharedList(getPool(), {
        listId: list.id,
        maxApplications: MAX_APPLICATIONS_READ_PER_LIST,
    });
    const applications = rows.map(toApplicationRow);

    return {
        id: list.id,
        name: list.name,
        description: list.description,
        owner: {
            id: list.ownerId,
            name: list.ownerName,
            image: list.ownerImage,
        },
        expiresAt: expiresAt?.toISOString() ?? null,
        stats: listStats(applications),
        applications,
    };
};

// A live link and the list behind it, without the list's rows. One indexed
// probe, and the whole of what an anonymous caller can make the app do before
// it knows the token is real: unknown, revoked and past its date all come back
// as null and are indistinguishable from outside.
export type ShareLinkTarget = {
    linkId: string;
    listId: string;
    name: string;
    description: string | null;
    ownerId: string;
    ownerName: string;
    ownerImage: string | null;
    expiresAt: Date | null;
};

export const findShareLink = async (
    token: string,
): Promise<ShareLinkTarget | null> =>
    gen.listForLinkToken(getPool(), { token });

// The rows behind a link that has already been found. Split from the lookup so
// the expensive half happens only for a token that exists, and only once the
// caller has taken that link's share of the budget.
export const getSharedListForLink = async (
    link: ShareLinkTarget,
): Promise<SharedList> =>
    withApplications(
        {
            id: link.listId,
            name: link.name,
            description: link.description,
            ownerId: link.ownerId,
            ownerName: link.ownerName,
            ownerImage: link.ownerImage,
        },
        link.expiresAt,
    );

// Counted once the page has been sent. A link nobody can open never reaches
// here, so the number beside a link in the share dialog only ever counts reads
// that actually happened.
export const recordLinkView = async (linkId: string): Promise<void> => {
    await gen.recordLinkView(getPool(), { id: linkId });
};

// A list shared with this signed-in account by name or through being a friend.
// Which of the two it was is settled in the query, and a list that is neither
// comes back as null exactly as a list that does not exist does.
export const getSharedListForViewer = async (
    viewerId: string,
    listId: string,
): Promise<SharedList | null> => {
    // lists.id is a uuid column, so a forged id of any other shape makes
    // Postgres raise rather than return nothing, and the 404 this promises
    // would arrive as a 500. Checked here rather than in the page because the
    // page renders its metadata and its body as separate components, and only
    // one of them can hold the guard.
    if (!applicationIdSchema.safeParse(listId).success) return null;

    const list = await gen.sharedListForViewer(getPool(), { listId, viewerId });
    return list && withApplications(list, null);
};

export type SharedListSummary = {
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
    owner: Person;
    totalApplications: number;
};

export const getListsSharedWithUser = async (
    userId: string,
): Promise<SharedListSummary[]> => {
    const rows = await gen.listsSharedWithUser(getPool(), {
        userId,
        maxLists: MAX_SHARED_LISTS_READ,
    });
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        updatedAt: row.updatedAt.toISOString(),
        owner: {
            id: row.ownerId,
            name: row.ownerName,
            image: row.ownerImage,
        },
        totalApplications: row.totalApplications,
    }));
};
