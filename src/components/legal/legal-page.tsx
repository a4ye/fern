import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GITHUB_URL } from "@/lib/site";

export const LegalPage = ({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) => (
    <main className="flex min-h-full flex-1 flex-col">
        <header className="border-b border-hairline">
            <div className="h-0.75 bg-accent" />
            <div className="mx-auto flex h-14 w-full max-w-3xl items-center px-6">
                <Link
                    href="/"
                    className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
                >
                    <Logo className="h-5 w-auto" />
                    <span className="text-sm font-semibold tracking-tight text-ink">
                        Job Tracker
                    </span>
                </Link>
            </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-3 inline-flex items-center border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-sub">
                Draft, being finalized ahead of launch
            </p>
            <div className="mt-8 space-y-4 text-sm leading-7 text-sub">
                {children}
            </div>
            <p className="mt-8 text-sm leading-7 text-sub">
                Questions in the meantime? Open an issue on{" "}
                <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
                >
                    GitHub
                </a>
                .
            </p>
            <Link
                href="/"
                className="mt-12 inline-block text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
            >
                Back to home
            </Link>
        </div>
    </main>
);
