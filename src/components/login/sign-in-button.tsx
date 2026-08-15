"use client";

import { authClient } from "@/lib/auth-client";

export const SignInButton = () => (
    <button
        type="button"
        aria-describedby="sign-in-terms"
        onClick={() =>
            void authClient.signIn.social({
                provider: "github",
                callbackURL: "/dashboard",
                errorCallbackURL: "/login",
            })
        }
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 bg-accent text-sm font-medium text-background transition-[background-color,transform] hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96]"
    >
        <span
            aria-hidden="true"
            className="icon-[simple-icons--github] h-4 w-4"
        />
        Continue with GitHub
    </button>
);
