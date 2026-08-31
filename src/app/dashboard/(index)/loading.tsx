import { ListsPageSkeleton } from "@/components/dashboard/lists-skeleton";
import { getRequestSession } from "@/lib/auth";
import { isEmailSyncApproved } from "@/lib/email/access";

const DashboardLoading = async () => {
    const session = await getRequestSession();

    return (
        <ListsPageSkeleton
            hasInboxSync={isEmailSyncApproved(session?.user.email)}
        />
    );
};
export default DashboardLoading;
