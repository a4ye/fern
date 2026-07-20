import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";

const Home = async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/login");

    return (
        <main className="flex flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-hairline px-6">
                <Logo className="h-5 w-auto" />
                <div className="flex items-center gap-4">
                    <p className="text-xs font-medium text-sub">
                        {session.user.email}
                    </p>
                    <SignOutButton />
                </div>
            </header>
        </main>
    );
};
export default Home;
