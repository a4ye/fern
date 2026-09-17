"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
    ADMIN_PATH,
    FRIENDS_PATH,
    SETTINGS_PATH,
} from "@/components/dashboard/data";
import { useViewing } from "@/components/dashboard/viewing";

const ICON_LINK_CLASS =
    "focus-frame flex items-center text-muted transition-colors hover:text-ink";

const Avatar = ({
    image,
    initial,
}: {
    image?: string | null;
    initial: string;
}) =>
    image ? (
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
    );

export const TopBarLinks = ({
    name,
    image,
    isAdmin,
}: {
    name: string;
    image?: string | null;
    isAdmin: boolean;
}) => {
    const pathname = usePathname();
    const params = useSearchParams();
    // Settings turns an admin viewing an account straight back to the
    // dashboard, so the avatar stops being a link and stays only as the mark of
    // whose pages these are.
    const viewing = useViewing();

    // Every page behind these links has a back button, so each link carries the
    // address it was clicked from. Already on the page a link opens, the way
    // back is the one held in that page's own URL, which keeps the link pointing
    // where it did on arrival instead of at the page it is already on.
    const query = params.toString();
    const here = query ? `${pathname}?${query}` : pathname;
    const hrefTo = (target: string): string => {
        const from = pathname === target ? params.get("from") : here;
        return from ? `${target}?from=${encodeURIComponent(from)}` : target;
    };

    const initial = name.trim().charAt(0).toUpperCase() || "U";

    return (
        <>
            {isAdmin ? (
                <Link
                    href={hrefTo(ADMIN_PATH)}
                    aria-label="Accounts"
                    title="Accounts"
                    className={ICON_LINK_CLASS}
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--shield] size-4"
                    />
                </Link>
            ) : null}

            <Link
                href={hrefTo(FRIENDS_PATH)}
                aria-label="Friends"
                title="Friends"
                className={ICON_LINK_CLASS}
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--users] size-4"
                />
            </Link>

            {viewing ? (
                <span className="flex items-center gap-2.5">
                    <Avatar image={image} initial={initial} />
                    <span className="hidden text-sm font-medium text-ink sm:block">
                        {name}
                    </span>
                </span>
            ) : (
                <Link
                    href={hrefTo(SETTINGS_PATH)}
                    aria-label="Settings"
                    title="Settings"
                    className="flex items-center gap-2.5 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <Avatar image={image} initial={initial} />
                    <span className="hidden text-sm font-medium text-ink sm:block">
                        {name}
                    </span>
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--settings] size-4 text-muted"
                    />
                </Link>
            )}
        </>
    );
};
