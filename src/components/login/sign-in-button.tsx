"use client";

import { track } from "@/lib/analytics";

export const SignInButton = ({
    callbackURL,
    errorCallbackURL,
}: {
    callbackURL: string;
    errorCallbackURL: string;
}) => (
    <button
        type="button"
        aria-describedby="sign-in-terms"
        onClick={() => {
            track("sign-in-start", { provider: "github" });
            void import("@/lib/auth-client").then(({ authClient }) =>
                authClient.signIn.social({
                    provider: "github",
                    callbackURL,
                    errorCallbackURL,
                }),
            );
        }}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 bg-accent text-sm font-medium text-background transition-[background-color,transform] hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96]"
    >
        <span
            aria-hidden="true"
            className="icon-[simple-icons--github] h-4 w-4"
        />
        Continue with GitHub
    </button>
);
