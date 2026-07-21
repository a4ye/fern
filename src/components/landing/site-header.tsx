import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GITHUB_URL } from "@/lib/site";

export const SiteHeader = () => (
    <header className="sticky top-0 z-50 border-b border-hairline bg-background/90 backdrop-blur-sm">
        <div className="h-0.75 bg-accent" />
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between border-x border-hairline px-6 sm:px-10">
            <Link
                href="/"
                className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
            >
                <Logo className="h-5 w-auto" />
                <span className="text-sm font-semibold tracking-tight text-ink">
                    Job Tracker
                </span>
            </Link>
            <div className="flex items-center gap-5">
                <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Source on GitHub"
                    className="inline-flex items-center text-sub transition-colors hover:text-ink"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[simple-icons--github] size-5"
                    />
                </a>
                <Link
                    href="/login"
                    className="text-sm font-medium text-sub transition-colors hover:text-ink"
                >
                    Sign in
                </Link>
                <Link
                    href="/login"
                    className="hidden h-8 items-center bg-accent px-3.5 text-xs font-medium text-background transition-colors hover:bg-accent-deep sm:inline-flex"
                >
                    Start tracking
                </Link>
            </div>
        </div>
    </header>
);
