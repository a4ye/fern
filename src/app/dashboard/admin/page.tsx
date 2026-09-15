import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRealSession, getViewAs, isAdminRequest } from "@/lib/auth";
import { searchUsers } from "@/db/admin";
import { formatRelative } from "@/components/dashboard/data";
import { startViewAs } from "@/app/dashboard/admin/actions";

export const metadata: Metadata = {
    title: "Accounts",
};

const AdminPage = async ({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) => {
    // A page nobody but an admin may open is also a page nobody else should be
    // able to tell exists, so this is a miss rather than a refusal.
    if (!(await isAdminRequest())) notFound();

    const [real, viewAs, params] = await Promise.all([
        getRealSession(),
        getViewAs(),
        searchParams,
    ]);
    const search = (params.q ?? "").trim();
    const users = await searchUsers(search);

    return (
        <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:px-10">
            <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--chevron-left] size-4"
                />
                Back
            </Link>

            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
                Accounts
            </h1>
            <p className="mt-2 max-w-prose text-sm text-sub">
                Open an account to impersonate a user. Everything is read-only
                while impersonating.
            </p>

            <form action="/dashboard/admin" className="mt-8 flex gap-2">
                <input
                    type="search"
                    name="q"
                    defaultValue={search}
                    placeholder="Search by name or email"
                    aria-label="Search accounts"
                    className="focus-frame h-9 w-full max-w-sm border border-hairline bg-background px-3 text-sm text-ink placeholder:text-muted"
                />
                <button
                    type="submit"
                    className="focus-frame flex h-9 cursor-pointer items-center border border-hairline px-3 text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-ink"
                >
                    Search
                </button>
            </form>

            {users.length === 0 ? (
                <p className="mt-10 text-sm text-muted">
                    No account matches that.
                </p>
            ) : (
                <table className="mt-8 w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-hairline text-left text-xs font-medium text-muted">
                            <th className="pb-2 font-medium">Account</th>
                            <th className="pb-2 font-medium">Lists</th>
                            <th className="pb-2 font-medium">Applications</th>
                            <th className="pb-2 font-medium">Joined</th>
                            <th className="pb-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr
                                key={user.id}
                                className="border-b border-faint align-top"
                            >
                                <td className="py-4 pr-6">
                                    <span className="block font-medium text-ink">
                                        {user.name}
                                    </span>
                                    <span className="block text-xs text-sub">
                                        {user.email}
                                    </span>
                                </td>
                                <td className="py-4 pr-6 text-sub">
                                    {user.lists}
                                </td>
                                <td className="py-4 pr-6 text-sub">
                                    {user.applications}
                                </td>
                                <td className="py-4 pr-6 text-sub">
                                    {formatRelative(user.createdAt)}
                                </td>
                                <td className="py-4 text-right">
                                    {user.id === real?.user.id ? (
                                        <span className="text-xs text-muted">
                                            You
                                        </span>
                                    ) : user.id === viewAs?.user.id ? (
                                        <span className="text-xs text-accent">
                                            Viewing
                                        </span>
                                    ) : (
                                        <form action={startViewAs}>
                                            <input
                                                type="hidden"
                                                name="userId"
                                                value={user.id}
                                            />
                                            <button
                                                type="submit"
                                                className="focus-frame inline-flex h-8 cursor-pointer items-center border border-hairline px-3 text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-ink"
                                            >
                                                View as
                                            </button>
                                        </form>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
export default AdminPage;
