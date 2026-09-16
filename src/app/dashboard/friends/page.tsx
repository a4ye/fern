import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestSession, getViewAs } from "@/lib/auth";
import { getFriendsPage, githubAccountIdForUser } from "@/db/friends";
import { githubUsername } from "@/lib/github";
import { FriendsManager } from "@/components/friends/friends-manager";

export const metadata: Metadata = {
    title: "Friends",
};

const FriendsPage = async () => {
    const session = await getRequestSession();
    if (!session) redirect("/login");

    // An admin viewing another account may read this page but cannot act on it,
    // since every action behind it refuses while viewing. The one thing that
    // would be wrong to show is the viewer's own GitHub handle under somebody
    // else's name, so that is left out rather than the page being refused.
    const viewing = Boolean(await getViewAs());

    const [page, accountId] = await Promise.all([
        getFriendsPage(session.user.id),
        viewing ? null : githubAccountIdForUser(session.user.id),
    ]);
    const username = accountId ? await githubUsername(accountId) : null;

    return (
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
            <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--chevron-left] size-4"
                />
                Lists
            </Link>

            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
                Friends
            </h1>

            <FriendsManager page={page} username={username} />
        </div>
    );
};
export default FriendsPage;
