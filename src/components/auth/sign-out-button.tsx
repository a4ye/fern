"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const SignOutButton = () => {
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() =>
                void import("@/lib/auth-client")
                    .then(({ authClient }) =>
                        authClient.signOut({
                            fetchOptions: {
                                onSuccess: () => router.push("/login"),
                                onError: () => {
                                    toast.error("Sign out failed. Try again.");
                                },
                            },
                        }),
                    )
                    .catch(() => {
                        toast.error("Sign out failed. Try again.");
                    })
            }
            className="focus-frame flex h-8 cursor-pointer items-center border border-hairline px-3 text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-ink"
        >
            Sign out
        </button>
    );
};
