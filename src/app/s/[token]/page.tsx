import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { AppToaster } from "@/components/dashboard/app-toaster";
import { ErrorShell } from "@/components/error/error-shell";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { SharedList } from "@/components/shared/shared-list";
import { getExchangeRates } from "@/db/exchange-rates";
import {
    findShareLink,
    getSharedListForLink,
    recordLinkView,
} from "@/db/shares";
import { withinBudget } from "@/db/rate-limit";
import { isShareToken } from "@/lib/share";

type Props = { params: Promise<{ token: string }> };

// Never cached. Revoking a link has to take effect on the next request, and a
// page held anywhere between here and the reader would keep serving a list its
// owner has already taken back.
export const dynamic = "force-dynamic";

// The only page in the app anybody can reach without signing in that draws
// somebody's data. The address is the whole of the authorisation, so the page
// keeps it to itself: search engines are told not to index it, and no request
// it makes may carry it onward as a referrer.
export const metadata: Metadata = {
    title: "Shared list",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
};

const SharedListPage = async ({ params }: Props) => {
    const { token } = await params;
    // Turned away on shape before the database is asked, so a caller trying
    // addresses spends nothing on a query. A real token is 43 base64url
    // characters and nothing else ever was one.
    if (!isShareToken(token)) notFound();

    // Unknown, revoked and expired all land here and are not told apart. A page
    // that said which would confirm a link had once been real.
    const link = await findShareLink(token);
    if (!link) notFound();

    // Counted per link rather than per reader, since nobody here is signed in,
    // and keyed on the link's row rather than on what was typed. That matters:
    // the budget is kept in a table with one row per key and no expiry, so a
    // key anybody could invent would let a caller grow it without end. Keyed on
    // a link, there are only ever as many rows as there are real links, and a
    // made-up address costs one indexed probe and nothing else.
    //
    // A spent budget is its own page rather than a 404. Everybody holding one
    // link shares this number, so being turned away here means the link is busy,
    // and a 404 would tell a reader it had been revoked when it had not.
    if (!(await withinBudget(link.linkId, "share"))) {
        return (
            <ErrorShell
                code="429"
                title="This link is busy right now."
                description="It is being opened by a lot of people at once. Wait a moment and reload the page."
            />
        );
    }

    const [list, rates] = await Promise.all([
        getSharedListForLink(link),
        getExchangeRates(),
    ]);

    // Off the response path: the reader waits for their list, not for the tally
    // beside it in the owner's share dialog.
    after(() => recordLinkView(link.linkId));

    return (
        <main className="flex flex-1 flex-col bg-surface">
            <SiteHeader framed={false} />
            <SharedList list={list} rates={rates} />
            <SiteFooter />
            <AppToaster />
        </main>
    );
};
export default SharedListPage;
