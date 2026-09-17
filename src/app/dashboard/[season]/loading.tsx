import { getViewAs } from "@/lib/auth";
import { SeasonPageSkeleton } from "@/components/dashboard/season-skeleton";

const SeasonLoading = async () => (
    <SeasonPageSkeleton viewing={Boolean(await getViewAs())} />
);
export default SeasonLoading;
