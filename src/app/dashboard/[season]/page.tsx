import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth";
import { getListDetail } from "@/db/dashboard";
import { getListHistory } from "@/db/history";
import { getExchangeRates } from "@/db/exchange-rates";
import { getUserSettings } from "@/db/settings";
import { ApplicationsTable } from "@/components/dashboard/applications-table";
import { listsHrefFrom } from "@/components/dashboard/data";
import { ListHeader } from "@/components/dashboard/list-header";
import { ListInsights } from "@/components/dashboard/list-insights";

type Props = {
    params: Promise<{ season: string }>;
    searchParams: Promise<{ from?: string }>;
};

const loadListDetail = cache(getListDetail);

export const generateMetadata = async ({
    params,
}: Props): Promise<Metadata> => {
    const session = await getRequestSession();
    if (!session) return { title: "List" };
    const detail = await loadListDetail(session.user.id, (await params).season);
    return { title: detail ? detail.name : "List" };
};

const SeasonPage = async ({ params, searchParams }: Props) => {
    const session = await getRequestSession();
    if (!session) redirect("/login");
    const { season } = await params;

    const [detail, settings, rates, history] = await Promise.all([
        loadListDetail(session.user.id, season),
        getUserSettings(session.user.id),
        getExchangeRates(),
        getListHistory(session.user.id, season),
    ]);
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
                history={history}
                defaultCurrency={settings.defaultCurrency}
            />

            <div className="mt-6">
                <ListInsights
                    name={detail.name}
                    stats={detail.stats}
                    funnel={detail.funnel}
                    flow={detail.flow}
                    volume={detail.volume}
                    places={detail.places}
                />
            </div>

            <div className="mt-4">
                <ApplicationsTable
                    listId={detail.id}
                    name={detail.name}
                    applications={detail.applications}
                    defaultCurrency={settings.defaultCurrency}
                    cleanLinks={settings.cleanLinks}
                    employerLinks={settings.employerLinks}
                    tidyTitles={settings.tidyTitles}
                    rates={rates}
                />
            </div>
        </div>
    );
};
export default SeasonPage;
