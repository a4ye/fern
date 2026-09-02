"use client";

import { useEffect } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import * as Sentry from "@sentry/nextjs";
import { ErrorShell } from "@/components/error/error-shell";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
    variable: "--font-be-vietnam-pro",
    subsets: ["latin"],
    weight: ["400", "500", "600"],
});

const GlobalError = ({
    error,
    unstable_retry,
}: {
    error: Error & { digest?: string };
    unstable_retry: () => void;
}) => {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html
            lang="en"
            className={`${beVietnamPro.variable} h-full antialiased`}
        >
            <body className="flex min-h-full flex-col">
                <ErrorShell
                    code="500"
                    title="The app hit a snag."
                    description="A critical error stopped the page from loading. Try again, and if it keeps happening, please open an issue on GitHub."
                >
                    <button
                        type="button"
                        onClick={() => unstable_retry()}
                        className="inline-flex h-10 items-center bg-accent px-5 text-sm font-medium text-background transition-colors hover:bg-accent-deep"
                    >
                        Try again
                    </button>
                </ErrorShell>
            </body>
        </html>
    );
};
export default GlobalError;
