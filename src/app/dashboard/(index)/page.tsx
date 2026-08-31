import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth";
import { getListsForUser } from "@/db/dashboard";
import { loadEmailPanel } from "@/lib/email/panel";
import { LIST_PAGE_SIZE, parseListSort } from "@/components/dashboard/data";
import { ListsIndex } from "@/components/dashboard/lists-index";

export const metadata: Metadata = {
    title: "Lists",
};

const DashboardPage = async ({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) => {
    const requestHeaders = await headers();
    const session = await getRequestSession();
    if (!session) redirect("/login");

    const params = await searchParams;
    const search = (params.q ?? "").trim();
    const sort = parseListSort(params.sort);
    const requestedPage = Math.max(1, Number(params.page) || 1);

    const [{ lists, total, page, pageCount }, emailPanel] = await Promise.all([
        getListsForUser(session.user.id, {
            search,
            sort,
            page: requestedPage,
            pageSize: LIST_PAGE_SIZE,
        }),
        loadEmailPanel(session.user.id, session.user.email, requestHeaders),
    ]);

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10">
            <ListsIndex
                lists={lists}
                total={total}
                page={page}
                pageCount={pageCount}
                search={search}
                sort={sort}
                emailPanel={emailPanel}
            />
        </div>
    );
};
export default DashboardPage;
