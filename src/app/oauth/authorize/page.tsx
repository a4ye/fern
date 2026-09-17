import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRealSession } from "@/lib/auth";
import { oauthConsentRequest } from "@/db/account";
import { allowsWrite } from "@/lib/mcp/scopes";
import { APP_NAME } from "@/lib/site";
import { Logo } from "@/components/brand/logo";
import { ConsentButtons } from "@/components/oauth/consent-buttons";

export const metadata: Metadata = {
    title: "Connect an app",
    // A consent screen is worth one stolen click, so it may not be drawn inside
    // somebody else's page. The headers set in next.config.ts say the same for
    // every route; this is the one that would be attacked.
    robots: { index: false, follow: false },
};

const AuthorizePage = async ({
    searchParams,
}: {
    searchParams: Promise<{ consent_code?: string }>;
}) => {
    const { consent_code: consentCode } = await searchParams;
    if (!consentCode) redirect("/dashboard");

    // The account a token would be minted against is the browser's own, which
    // is not the account on screen while an admin is viewing another. Asked for
    // directly so the page cannot describe the grant as somebody else's.
    const session = await getRealSession();
    if (!session) redirect("/login");

    // Read from the code rather than from the query, so the name and the
    // destination shown belong to the grant that approving this will write.
    const request = await oauthConsentRequest(consentCode);
    if (!request) redirect("/dashboard");

    // A code issued for a different account is not this browser's to approve.
    if (request.userId !== session.user.id) redirect("/dashboard");

    const name = request.clientName;

    // What the token would actually be allowed to do, rather than what a
    // connection is usually allowed to do. A client may ask to read without
    // being able to change anything, and a screen that listed the writes
    // regardless would be asking for more than the grant it is approving.
    const writes = allowsWrite(request.scopes);
    const grants = [
        "Read your lists, applications, and insights",
        ...(writes
            ? [
                  "Add, edit, and delete applications and lists",
                  "Change your currency and link preferences",
              ]
            : []),
    ];

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
                    {request.redirectHost && (
                        <p className="mt-2 text-sm leading-6 text-sub">
                            It will send your data to{" "}
                            <span className="font-medium text-ink">
                                {request.redirectHost}
                            </span>
                            .
                        </p>
                    )}

                    <ul className="mt-6 space-y-2 border-t border-faint pt-6 text-sm leading-6 text-sub">
                        {grants.map((grant) => (
                            <li key={grant} className="flex gap-2.5">
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--check] mt-1.5 size-3.5 shrink-0 text-accent"
                                />
                                {grant}
                            </li>
                        ))}
                    </ul>

                    <p className="mt-6 text-pretty text-xs leading-5 text-muted">
                        {writes
                            ? "It cannot see your friends, share a list, or delete your account. Every change it makes is kept in the list history, where you can undo it."
                            : "It cannot change anything, see your friends, share a list, or delete your account."}
                    </p>

                    <ConsentButtons consentCode={consentCode} name={name} />
                </div>
            </div>
        </main>
    );
};
export default AuthorizePage;
