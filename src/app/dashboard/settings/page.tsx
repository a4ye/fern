import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, getRequestSession, GITHUB_PROVIDER_ID } from "@/lib/auth";
import { getUserSettings } from "@/db/settings";
import { githubUsername } from "@/lib/github";
import { settingsBackHref } from "@/components/dashboard/data";
import { AccountSettings } from "@/components/settings/account-settings";

export const metadata: Metadata = {
    title: "Settings",
};

const SettingsPage = async ({
    searchParams,
}: {
    searchParams: Promise<{ from?: string }>;
}) => {
    const requestHeaders = await headers();
    const session = await getRequestSession();
    if (!session) redirect("/login");

    const [settings, accounts] = await Promise.all([
        getUserSettings(session.user.id),
        auth.api.listUserAccounts({ headers: requestHeaders }),
    ]);

    // GitHub is the only way in, and its username is what the user knows the
    // account by. The email address stands in when GitHub cannot be reached.
    const github = accounts.find(
        (account) => account.providerId === GITHUB_PROVIDER_ID,
    );
    const username = github ? await githubUsername(github.accountId) : null;

    return (
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
            <Link
                href={settingsBackHref((await searchParams).from)}
                className="inline-flex items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--chevron-left] size-4"
                />
                Back
            </Link>

            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
                Settings
            </h1>

            <AccountSettings
                name={session.user.name}
                signedInAs={username ?? session.user.email}
                image={session.user.image ?? null}
                defaultCurrency={settings.defaultCurrency}
                cleanLinks={settings.cleanLinks}
            />
        </div>
    );
};
export default SettingsPage;
