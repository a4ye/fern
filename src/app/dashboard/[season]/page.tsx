import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getListDetail } from "@/db/dashboard";
import { ApplicationsTable } from "@/components/dashboard/applications-table";
import { listsHrefFrom } from "@/components/dashboard/data";
import { ListHeader } from "@/components/dashboard/list-header";
import { ListInsights } from "@/components/dashboard/list-insights";

type Props = {
    params: Promise<{ season: string }>;
    searchParams: Promise<{ from?: string }>;
};

export const generateMetadata = async ({
    params,
}: Props): Promise<Metadata> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { title: "List" };
    const detail = await getListDetail(session.user.id, (await params).season);
    return { title: detail ? detail.name : "List" };
};

const SeasonPage = async ({ params, searchParams }: Props) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");

    const detail = await getListDetail(session.user.id, (await params).season);
    if (!detail) notFound();

    return (
        <div className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10 sm:px-10">
            <Link
                href={listsHrefFrom((await searchParams).from)}
                className="inline-flex items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--chevron-left] size-4"
                />
                Lists
            </Link>

            <ListHeader
                listId={detail.id}
                name={detail.name}
                description={detail.description}
                status={detail.status}
            />

            <div className="mt-6">
                <ListInsights
                    name={detail.name}
                    stats={detail.stats}
                    pipeline={detail.pipeline}
                    flow={detail.flow}
                    activity={detail.activity}
                />
            </div>

            <div className="mt-4">
                <ApplicationsTable
                    listId={detail.id}
                    name={detail.name}
                    applications={detail.applications}
                />
            </div>
        </div>
    );
};
export default SeasonPage;
