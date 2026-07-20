"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export const SignOutButton = () => {
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() =>
                void authClient.signOut({
                    fetchOptions: {
                        onSuccess: () => router.push("/login"),
                        onError: () => {
                            toast.error("Sign out failed. Try again.");
                        },
                    },
                })
            }
            className="cursor-pointer flex h-8 items-center border border-hairline px-3 text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            Sign out
        </button>
    );
};
