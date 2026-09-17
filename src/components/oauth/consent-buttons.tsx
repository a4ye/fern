"use client";

import { useState } from "react";

// The consent endpoint answers with where to send the browser next, for a
// refusal as much as for an approval: a denied request goes back to the client
// carrying the error, which is what lets the app that asked say so itself
// rather than appearing to hang.
const decide = async (
    consentCode: string,
    accept: boolean,
): Promise<string> => {
    const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, consent_code: consentCode }),
    });
    if (!response.ok) throw new Error("Consent was not recorded.");
    const { redirectURI } = (await response.json()) as { redirectURI: string };
    return redirectURI;
};

export const ConsentButtons = ({
    consentCode,
    name,
}: {
    consentCode: string;
    name: string;
}) => {
    const [pending, setPending] = useState<"accept" | "deny" | null>(null);
    const [failed, setFailed] = useState(false);

    const answer = (accept: boolean) => async () => {
        setPending(accept ? "accept" : "deny");
        setFailed(false);
        try {
            window.location.href = await decide(consentCode, accept);
        } catch {
            setPending(null);
            setFailed(true);
        }
    };

    return (
        <div className="mt-8">
            <div className="flex gap-3">
                <button
                    type="button"
                    disabled={pending !== null}
                    onClick={answer(false)}
                    className="h-11 flex-1 cursor-pointer border border-hairline text-sm font-medium text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-60"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={pending !== null}
                    onClick={answer(true)}
                    className="h-11 flex-1 cursor-pointer bg-accent text-sm font-medium text-background transition-[background-color,transform] hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] disabled:cursor-default disabled:opacity-60 disabled:active:scale-100"
                >
                    Connect
                </button>
            </div>
            <p
                aria-live="polite"
                className="mt-3 min-h-5 text-xs font-medium text-rose"
            >
                {failed ? `${name} was not connected. Try again.` : ""}
            </p>
        </div>
    );
};
