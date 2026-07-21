import type { ReactNode } from "react";
import Link from "next/link";
import { Logo, CARET_PATH } from "@/components/brand/logo";

export const ErrorShell = ({
    code,
    title,
    description,
    children,
}: {
    code: string;
    title: string;
    description: string;
    children?: ReactNode;
}) => (
    <main className="flex flex-1 items-center justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-2xl">
            <div className="h-0.75 bg-accent" />
            <div className="relative overflow-hidden border-x border-b border-hairline bg-background p-9 sm:p-12">
                <svg
                    aria-hidden="true"
                    viewBox="8 10 40 30"
                    className="pointer-events-none absolute -top-6 -right-6 h-44 w-auto"
                >
                    <path d={CARET_PATH} className="fill-accent-tint-soft" />
                </svg>

                <div className="relative">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-70"
                    >
                        <Logo className="h-6 w-auto" />
                        <span className="text-sm font-semibold tracking-tight text-ink">
                            Job Tracker
                        </span>
                    </Link>

                    <p className="mt-10 text-sm font-medium text-accent-deep tabular-nums">
                        {code}
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
                        {title}
                    </h1>
                    <p className="mt-3 max-w-md text-sm leading-7 text-sub">
                        {description}
                    </p>

                    <div className="mt-9 flex items-center gap-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    </main>
);
