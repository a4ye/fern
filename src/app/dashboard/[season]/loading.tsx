import { getRequestSession, getViewAs } from "@/lib/auth";
import { getUserSettings } from "@/db/settings";
import { SeasonPageSkeleton } from "@/components/dashboard/season-skeleton";

// The Ranking column changes every column's width, so the placeholder has to
// know whether the table will draw one or its bars jump when the rows land.
const SeasonLoading = async () => {
    const [viewAs, session] = await Promise.all([
        getViewAs(),
        getRequestSession(),
    ]);
    const settings = session ? await getUserSettings(session.user.id) : null;
    return (
        <SeasonPageSkeleton
            viewing={Boolean(viewAs)}
            rankings={settings?.waterlooRankings ?? false}
        />
    );
};
export default SeasonLoading;
