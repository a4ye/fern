import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LoginArt } from "@/components/login/login-art";

const LoginLoading = () => (
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

                    <div aria-hidden="true">
                        <span className="skeleton mt-8 block h-7 w-48 max-w-full" />
                        <span className="skeleton mt-3 block h-3.5 w-64 max-w-full" />

                        <span className="skeleton mt-8 block h-10 w-full" />
                        <div className="mt-3 space-y-2 py-0.5">
                            <span className="skeleton block h-3 w-full" />
                            <span className="skeleton block h-3 w-4/5" />
                        </div>
                    </div>
                    <p className="sr-only" role="status">
                        Loading sign in
                    </p>
                </div>
                <div className="relative h-40 border-t border-hairline bg-accent-tint-soft sm:h-auto sm:border-t-0 sm:border-l">
                    <LoginArt />
                </div>
            </div>
        </div>
    </main>
);

export default LoginLoading;
