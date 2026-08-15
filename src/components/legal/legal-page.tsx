import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import {
    APP_NAME,
    GITHUB_URL,
    LEGAL_CONTACT_EMAIL,
    LEGAL_EFFECTIVE_DATE,
} from "@/lib/site";

export type LegalSectionLink = { id: string; label: string };

const inlineLinkClass =
    "font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const LegalLink = ({
    href,
    children,
}: {
    href: string;
    children: ReactNode;
}) => {
    const external = href.startsWith("http");
    if (href.startsWith("/") && !external) {
        return (
            <Link href={href} className={inlineLinkClass}>
                {children}
            </Link>
        );
    }
    return (
        <a
            href={href}
            className={inlineLinkClass}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
        >
            {children}
        </a>
    );
};

export const LegalSection = ({
    id,
    title,
    children,
}: {
    id: string;
    title: string;
    children: ReactNode;
}) => (
    <section id={id} className="scroll-mt-24">
        <h2 className="text-xl font-semibold tracking-tight text-balance text-ink">
            {title}
        </h2>
        <div className="mt-4 space-y-4 text-sm leading-7 text-sub">
            {children}
        </div>
    </section>
);

export const LegalList = ({ children }: { children: ReactNode }) => (
    <ul className="list-disc space-y-2 pl-5 marker:text-muted">{children}</ul>
);

export const LegalContact = () =>
    LEGAL_CONTACT_EMAIL ? (
        <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
        </LegalLink>
    ) : (
        <LegalLink href={`${GITHUB_URL}/issues`}>GitHub Issues</LegalLink>
    );

export const LegalPage = ({
    title,
    summary,
    sections,
    children,
}: {
    title: string;
    summary: string;
    sections: LegalSectionLink[];
    children: ReactNode;
}) => (
    <main className="flex min-h-full flex-1 flex-col">
        <header className="border-b border-hairline">
            <div className="h-0.75 bg-accent" />
            <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-6 px-6 sm:px-10">
                <Link
                    href="/"
                    className="flex min-h-10 items-center gap-2.5 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <Logo className="h-5 w-auto" />
                    <span className="text-sm font-semibold tracking-tight text-ink">
                        {APP_NAME}
                    </span>
                </Link>
                <nav aria-label="Legal pages">
                    <ul className="flex items-center gap-1 text-xs text-sub sm:gap-3">
                        {[
                            ["/privacy", "Privacy"],
                            ["/terms", "Terms"],
                            ["/cookies", "Cookies"],
                        ].map(([href, label]) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="inline-flex min-h-10 items-center px-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>

        <div className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[12rem_minmax(0,48rem)]">
            <aside className="hidden lg:block">
                <nav
                    aria-label={`On this ${title}`}
                    className="sticky top-8 border-l border-hairline pl-4"
                >
                    <p className="text-xs font-semibold text-ink">
                        On this page
                    </p>
                    <ul className="mt-3 space-y-0.5">
                        {sections.map((section) => (
                            <li key={section.id}>
                                <a
                                    href={`#${section.id}`}
                                    className="flex min-h-10 items-center text-xs leading-5 text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                >
                                    {section.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>

            <article className="min-w-0">
                <header className="border-b border-hairline pb-8">
                    <p className="text-xs font-semibold text-accent-deep">
                        Legal
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
                        {title}
                    </h1>
                    <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-sub">
                        {summary}
                    </p>
                    <p className="mt-4 text-xs text-muted">
                        Effective and last updated {LEGAL_EFFECTIVE_DATE}
                    </p>
                </header>

                <div className="mt-10 space-y-12">{children}</div>

                <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
                    <Link
                        href="/"
                        className="inline-flex min-h-10 items-center text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Back to home
                    </Link>
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center gap-2 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[simple-icons--github] size-4"
                        />
                        View source
                    </a>
                </footer>
            </article>
        </div>
    </main>
);
