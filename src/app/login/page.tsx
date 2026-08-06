import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_NAME } from "@/lib/site";
import { Logo } from "@/components/brand/logo";
import { LoginArt } from "@/components/login/login-art";
import { SignInButton } from "@/components/login/sign-in-button";

export const metadata: Metadata = {
    title: "Sign in",
};

const LoginPage = async ({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session) redirect("/dashboard");

    const { error } = await searchParams;

    return (
        <main className="flex flex-1 items-center justify-center bg-surface px-6 py-16">
            <div className="w-full max-w-2xl">
                <Link
                    href="/"
                    className="mb-4 inline-flex items-center gap-1.5 text-sm text-sub transition-colors hover:text-ink"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--chevron-left] size-4"
                    />
                    Home
                </Link>
                <div className="h-0.75 bg-accent" />
                <div className="grid border-x border-b border-hairline bg-background sm:grid-cols-2">
                    <div className="p-9">
                        <Logo className="h-8 w-auto" />

                        <h1 className="mt-8 text-2xl font-semibold tracking-tight">
                            Sign in to {APP_NAME}
                        </h1>
                        <p className="mt-2 text-sm leading-6 text-sub">
                            The faster way to track your applications.
                        </p>

                        <div className="mt-8">
                            <SignInButton />
                            {error && (
                                <p className="mt-3 text-xs font-medium text-rose">
                                    Sign in with GitHub did not complete. Try
                                    again.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="relative h-40 border-t border-hairline bg-accent-tint-soft sm:h-auto sm:border-t-0 sm:border-l">
                        <LoginArt />
                    </div>
                </div>
            </div>
        </main>
    );
};
export default LoginPage;
