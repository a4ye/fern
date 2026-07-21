import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard",
};

const DashboardPage = () => (
    <main className="flex flex-1 items-center justify-center bg-surface px-6 py-16">
        <p className="text-sm text-sub">Dashboard coming soon.</p>
    </main>
);
export default DashboardPage;
