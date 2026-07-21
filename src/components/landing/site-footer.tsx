import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GITHUB_URL } from "@/lib/site";

type FooterLink = { label: string; href: string; external?: boolean };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
    {
        title: "Product",
        links: [
            { label: "How it works", href: "/#how" },
            { label: "Sign in", href: "/login" },
        ],
    },
    {
        title: "Project",
        links: [
            { label: "Source code", href: GITHUB_URL, external: true },
            { label: "Report an issue", href: `${GITHUB_URL}/issues`, external: true },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Cookie Policy", href: "/cookies" },
        ],
    },
];

const FooterColumn = ({ title, links }: { title: string; links: FooterLink[] }) => (
    <div>
        <h3 className="text-xs font-medium text-muted">{title}</h3>
        <ul className="mt-4 space-y-3">
            {links.map((link) => (
                <li key={link.label}>
                    {link.external ? (
                        <a
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-sub transition-colors hover:text-ink"
                        >
                            {link.label}
                        </a>
                    ) : (
                        <Link
                            href={link.href}
                            className="text-sm text-sub transition-colors hover:text-ink"
                        >
                            {link.label}
                        </Link>
                    )}
                </li>
            ))}
        </ul>
    </div>
);

export const SiteFooter = () => (
    <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto w-full max-w-6xl px-6 py-14 sm:px-10">
            <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
                <div>
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
                    >
                        <Logo className="h-5 w-auto" />
                        <span className="text-sm font-semibold tracking-tight text-ink">
                            Job Tracker
                        </span>
                    </Link>
                    <p className="mt-4 max-w-xs text-sm leading-6 text-sub">
                        Stop updating spreadsheets. Paste a link, connect your
                        inbox, and let the tracker do the rest.
                    </p>
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex items-center gap-2 text-sm text-sub transition-colors hover:text-ink"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[simple-icons--github] size-4"
                        />
                        View on GitHub
                    </a>
                </div>
                {FOOTER_COLUMNS.map((column) => (
                    <FooterColumn
                        key={column.title}
                        title={column.title}
                        links={column.links}
                    />
                ))}
            </div>
            <div className="mt-14 border-t border-hairline pt-6">
                <p className="text-xs text-muted">
                    Job Tracker, 2026. An open-source project.
                </p>
            </div>
        </div>
    </footer>
);
