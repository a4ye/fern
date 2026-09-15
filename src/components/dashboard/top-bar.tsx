import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SettingsLink } from "@/components/dashboard/settings-link";
import { ViewAsBar } from "@/components/dashboard/view-as-bar";
import { APP_NAME } from "@/lib/site";

export const DashboardTopBar = ({
    name,
    image,
    isAdmin = false,
    viewingAs = null,
}: {
    name: string;
    image?: string | null;
    isAdmin?: boolean;
    viewingAs?: { name: string; email: string } | null;
}) => (
    <header className="sticky top-0 z-50 border-b border-hairline bg-background/90 backdrop-blur-sm">
        <div className="h-0.75 bg-accent" />
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6 sm:px-10">
            <Link
                href="/"
                className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
            >
                <Logo className="h-5 w-auto" />
                <span className="text-sm font-semibold tracking-tight text-ink">
                    {APP_NAME}
                </span>
            </Link>
            <div className="flex items-center gap-4">
                {isAdmin ? (
                    <Link
                        href="/dashboard/admin"
                        aria-label="Accounts"
                        title="Accounts"
                        className="focus-frame flex items-center text-muted transition-colors hover:text-ink"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--users] size-4"
                        />
                    </Link>
                ) : null}
                <SettingsLink name={name} image={image} />
                <SignOutButton />
            </div>
        </div>
        {viewingAs ? (
            <ViewAsBar name={viewingAs.name} email={viewingAs.email} />
        ) : null}
    </header>
);
