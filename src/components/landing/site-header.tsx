import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SiteAccountLink } from "@/components/landing/site-account-link";
import { GITHUB_URL } from "@/lib/site";

export const SiteHeader = ({ framed = true }: { framed?: boolean }) => (
    <header className="sticky top-0 z-50 border-b border-hairline bg-background/90 backdrop-blur-sm">
        <div className="h-0.75 bg-accent" />
        <div
            className={`mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6 sm:px-10 ${framed ? "border-x border-hairline" : ""}`}
        >
            <Link
                href="/"
                className="flex items-center transition-opacity hover:opacity-70"
            >
                <Logo className="h-5 w-auto" />
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
                <SiteAccountLink />
            </div>
        </div>
    </header>
);
