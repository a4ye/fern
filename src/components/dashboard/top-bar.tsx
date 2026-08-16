import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SettingsLink } from "@/components/dashboard/settings-link";
import { APP_NAME } from "@/lib/site";

export const DashboardTopBar = ({
    name,
    image,
}: {
    name: string;
    image?: string | null;
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
                <SettingsLink name={name} image={image} />
                <SignOutButton />
            </div>
        </div>
    </header>
);
