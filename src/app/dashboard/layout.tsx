import type { ReactNode } from "react";
import { getRequestSession, getViewAs, isAdminRequest } from "@/lib/auth";
import { countIncomingRequests } from "@/db/friends";
import { AppToaster } from "@/components/dashboard/app-toaster";
import { PendingRequestsProvider } from "@/components/dashboard/pending-requests";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
import { ViewingProvider } from "@/components/dashboard/viewing";

const DashboardLayout = async ({ children }: { children: ReactNode }) => {
    const [session, viewAs, admin] = await Promise.all([
        getRequestSession(),
        getViewAs(),
        isAdminRequest(),
    ]);
    const name = session?.user.name ?? "there";
    const image = session?.user.image ?? null;
    const pendingRequests = session
        ? await countIncomingRequests(session.user.id)
        : 0;

    return (
        <ViewingProvider viewing={Boolean(viewAs)}>
            {/* Above the top bar and the page both, so the friends page can
            answer for the number the friends icon draws. */}
            <PendingRequestsProvider count={pendingRequests}>
                <main className="flex flex-1 flex-col bg-surface">
                    <DashboardTopBar
                        name={name}
                        image={image}
                        isAdmin={admin}
                        viewingAs={
                            viewAs && {
                                name: viewAs.user.name,
                                email: viewAs.user.email,
                            }
                        }
                    />
                    {children}
                    <AppToaster />
                </main>
            </PendingRequestsProvider>
        </ViewingProvider>
    );
};
export default DashboardLayout;
