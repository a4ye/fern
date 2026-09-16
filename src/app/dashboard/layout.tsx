import type { ReactNode } from "react";
import { getRequestSession, getViewAs, isAdminRequest } from "@/lib/auth";
import { AppToaster } from "@/components/dashboard/app-toaster";
import { DashboardTopBar } from "@/components/dashboard/top-bar";

const DashboardLayout = async ({ children }: { children: ReactNode }) => {
    const [session, viewAs, admin] = await Promise.all([
        getRequestSession(),
        getViewAs(),
        isAdminRequest(),
    ]);
    const name = session?.user.name ?? "there";
    const image = session?.user.image ?? null;

    return (
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
    );
};
export default DashboardLayout;
