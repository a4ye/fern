import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth";
import { getExchangeRates } from "@/db/exchange-rates";
import { getSharedListForViewer } from "@/db/shares";
import { SharedList } from "@/components/shared/shared-list";

type Props = { params: Promise<{ listId: string }> };

const loadSharedList = cache(getSharedListForViewer);

export const generateMetadata = async ({
    params,
}: Props): Promise<Metadata> => {
    const session = await getRequestSession();
    if (!session) return { title: "Shared list" };
    const list = await loadSharedList(session.user.id, (await params).listId);
    return { title: list ? list.name : "Shared list" };
};

// The other door into a shared list: a friend opening one from their own
// dashboard. Whether they may is settled in the query, which answers only for
// a list shared with them by name or through being a friend of its owner. A
// list that is not comes back as nothing and is a 404, exactly as one that does
// not exist is, so this page cannot be used to find out which lists are real.
const SharedListPage = async ({ params }: Props) => {
    const session = await getRequestSession();
    if (!session) redirect("/login");

    const { listId } = await params;
    const [list, rates] = await Promise.all([
        loadSharedList(session.user.id, listId),
        getExchangeRates(),
    ]);
    if (!list) notFound();

    return (
        <SharedList
            list={list}
            rates={rates}
            back={
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
            }
        />
    );
};
export default SharedListPage;
