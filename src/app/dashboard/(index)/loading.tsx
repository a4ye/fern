import { ListsPageSkeleton } from "@/components/dashboard/lists-skeleton";
import { getRequestSession, getViewAs } from "@/lib/auth";
import { isEmailSyncApproved } from "@/lib/email/access";

const DashboardLoading = async () => {
    const [session, viewAs] = await Promise.all([
        getRequestSession(),
        getViewAs(),
    ]);

    return (
        <ListsPageSkeleton
            hasInboxSync={!viewAs && isEmailSyncApproved(session?.user.email)}
            viewing={Boolean(viewAs)}
        />
    );
};
export default DashboardLoading;
