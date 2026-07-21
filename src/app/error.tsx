"use client";

import Link from "next/link";
import { ErrorShell } from "@/components/error/error-shell";

const ErrorPage = ({
    unstable_retry,
}: {
    error: Error & { digest?: string };
    unstable_retry: () => void;
}) => (
    <ErrorShell
        code="500"
        title="Something went wrong."
        description="An unexpected error interrupted the page. You can try again, or head back home."
    >
        <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex h-10 items-center bg-accent px-5 text-sm font-medium text-background transition-colors hover:bg-accent-deep"
        >
            Try again
        </button>
        <Link
            href="/"
            className="text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
        >
            Back to home
        </Link>
    </ErrorShell>
);
export default ErrorPage;
