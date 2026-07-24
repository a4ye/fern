import type { ReactNode } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { DashboardTopBar } from "@/components/dashboard/top-bar";

const DashboardLayout = async ({ children }: { children: ReactNode }) => {
    const session = await auth.api.getSession({ headers: await headers() });
    const name = session?.user.name ?? "there";
    const image = session?.user.image ?? null;

    return (
        <main className="flex flex-1 flex-col bg-surface">
            <DashboardTopBar name={name} image={image} />
            {children}
        </main>
    );
};
export default DashboardLayout;
