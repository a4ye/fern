import type { Metadata } from "next";
import Link from "next/link";
import { ErrorShell } from "@/components/error/error-shell";

export const metadata: Metadata = {
    title: "Page not found",
};

const NotFound = () => (
    <ErrorShell
        code="404"
        title="We couldn't find that page."
        description="The link may be broken, or the page may have moved."
    >
        <Link
            href="/"
            className="inline-flex h-10 items-center bg-accent px-5 text-sm font-medium text-background transition-colors hover:bg-accent-deep"
        >
            Back to home
        </Link>
        <Link
            href="/login"
            className="text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
        >
            Sign in
        </Link>
    </ErrorShell>
);
export default NotFound;
