"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SETTINGS_PATH } from "@/components/dashboard/data";

export const SettingsLink = ({
    name,
    image,
}: {
    name: string;
    image?: string | null;
}) => {
    const pathname = usePathname();
    const params = useSearchParams();

    // Already on settings, the page the user came from is the one held in the
    // URL. Reading it back keeps this link pointing where it did on arrival
    // instead of at settings itself.
    const query = params.toString();
    const from =
        pathname === SETTINGS_PATH
            ? params.get("from")
            : query
              ? `${pathname}?${query}`
              : pathname;

    const initial = name.trim().charAt(0).toUpperCase() || "U";

    return (
        <Link
            href={
                from
                    ? `${SETTINGS_PATH}?from=${encodeURIComponent(from)}`
                    : SETTINGS_PATH
            }
            aria-label="Settings"
            title="Settings"
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            {image ? (
                <Image
                    src={image}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 shrink-0 object-cover"
                />
            ) : (
                <span className="flex size-7 items-center justify-center border border-tile-border bg-background text-xs font-medium text-accent">
                    {initial}
                </span>
            )}
            <span className="hidden text-sm font-medium text-ink sm:block">
                {name}
            </span>
            <span
                aria-hidden="true"
                className="icon-[lucide--settings] size-4 text-muted"
            />
        </Link>
    );
};
