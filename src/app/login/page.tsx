import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { LoginArt } from "@/components/login/login-art";

export const metadata: Metadata = {
    title: "Sign in | Job Tracker",
};

const LoginPage = () => (
    <main className="flex flex-1 items-center justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-2xl">
            <div className="h-0.75 bg-accent" />
            <div className="grid border-x border-b border-hairline bg-background sm:grid-cols-2">
                <div className="p-9">
                    <Logo className="h-8 w-auto" />

                    <h1 className="mt-8 text-2xl font-semibold tracking-tight">
                        Sign in to Job Tracker
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-sub">
                        The faster way to track your applications.
                    </p>

                    <div className="mt-8">
                        <button
                            type="button"
                            className="flex h-11 w-full items-center justify-center gap-2.5 bg-accent text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[simple-icons--github] h-4 w-4"
                            />
                            Continue with GitHub
                        </button>
                    </div>
                </div>
                <div className="relative h-40 border-t border-hairline bg-accent-tint-soft sm:h-auto sm:border-t-0 sm:border-l">
                    <LoginArt />
                </div>
            </div>
        </div>
    </main>
);
export default LoginPage;
