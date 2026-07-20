"use client";

import { authClient } from "@/lib/auth-client";

export const SignInButton = () => (
    <button
        type="button"
        onClick={() =>
            void authClient.signIn.social({
                provider: "github",
                callbackURL: "/",
                errorCallbackURL: "/login",
            })
        }
        className="cursor-pointer flex h-11 w-full items-center justify-center gap-2.5 bg-accent text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
        <span
            aria-hidden="true"
            className="icon-[simple-icons--github] h-4 w-4"
        />
        Continue with GitHub
    </button>
);
