"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionState = "checking" | "signed-in" | "signed-out";

const hasSession = (value: unknown) =>
    typeof value === "object" && value !== null && "session" in value;

export const SiteAccountLink = () => {
    const [sessionState, setSessionState] = useState<SessionState>("checking");

    useEffect(() => {
        const controller = new AbortController();

        const checkSession = async () => {
            try {
                const response = await fetch("/api/auth/get-session", {
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!response.ok) return;

                const session: unknown = await response.json();
                if (!controller.signal.aborted) {
                    setSessionState(
                        hasSession(session) ? "signed-in" : "signed-out",
                    );
                }
            } catch {
                // Keep the neutral destination if the optional status check fails.
            }
        };

        void checkSession();
        return () => controller.abort();
    }, []);

    const signedOut = sessionState === "signed-out";
    const label =
        sessionState === "signed-in"
            ? "Dashboard"
            : signedOut
              ? "Sign in"
              : "Open app";

    return (
        <Link
            href={signedOut ? "/login" : "/dashboard"}
            className="relative inline-flex h-8 w-24 items-center justify-center bg-accent px-3.5 text-xs font-medium text-background transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-accent-deep"
        >
            <span aria-live="polite">{label}</span>
        </Link>
    );
};
