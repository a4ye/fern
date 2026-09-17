import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth";
import { oauthClientName } from "@/db/account";
import { APP_NAME } from "@/lib/site";
import { Logo } from "@/components/brand/logo";
import { ConsentButtons } from "@/components/oauth/consent-buttons";

export const metadata: Metadata = {
    title: "Connect an app",
};

const AuthorizePage = async ({
    searchParams,
}: {
    searchParams: Promise<{ client_id?: string; consent_code?: string }>;
}) => {
    const { client_id: clientId, consent_code: consentCode } =
        await searchParams;

    const session = await getRequestSession();
    if (!session) redirect("/login");

    const name = clientId ? await oauthClientName(clientId) : null;
    if (!name || !consentCode) redirect("/dashboard");

    return (
        <main className="flex flex-1 items-center justify-center bg-surface px-6 py-16">
            <div className="w-full max-w-md">
                <div className="h-0.75 bg-accent" />
                <div className="border-x border-b border-hairline bg-background p-9">
                    <Logo className="h-8 w-auto" />

                    <h1 className="mt-8 text-2xl font-semibold tracking-tight">
                        Connect {name}
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-sub">
                        {name} is asking to use {APP_NAME} as{" "}
                        {session.user.name}.
                    </p>

                    <ul className="mt-6 space-y-2 border-t border-faint pt-6 text-sm leading-6 text-sub">
                        <li className="flex gap-2.5">
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--check] mt-1.5 size-3.5 shrink-0 text-accent"
                            />
                            Read your lists, applications, and insights
                        </li>
                        <li className="flex gap-2.5">
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--check] mt-1.5 size-3.5 shrink-0 text-accent"
                            />
                            Add, edit, and delete applications and lists
                        </li>
                        <li className="flex gap-2.5">
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--check] mt-1.5 size-3.5 shrink-0 text-accent"
                            />
                            Change your currency and link preferences
                        </li>
                    </ul>

                    <p className="mt-6 text-pretty text-xs leading-5 text-muted">
                        It cannot see your friends, share a list, or delete your
                        account. Every change it makes is kept in the list
                        history, where you can undo it.
                    </p>

                    <ConsentButtons consentCode={consentCode} name={name} />
                </div>
            </div>
        </main>
    );
};
export default AuthorizePage;
