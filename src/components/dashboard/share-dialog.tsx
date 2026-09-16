"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
    createLink,
    removeLink,
    revokeLink,
    setSharedWithFriends,
    shareWithPerson,
    unshareWithPerson,
} from "@/app/dashboard/sharing-actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useLocalDateTimeFormatter } from "@/components/dashboard/local-date-time";
import {
    DIALOG_TITLE_ID,
    useOverlayDismiss,
} from "@/components/dashboard/overlay-shell";
import {
    CellSelect,
    primaryButtonClass,
    quietButtonClass,
    secondaryButtonClass,
    type Option,
} from "@/components/dashboard/table-controls";
import type { Friend } from "@/db/friends";
import type { ShareLink, ShareState } from "@/db/shares";
import {
    LINK_DURATIONS,
    linkState,
    sharePath,
    type LinkDuration,
    type LinkState,
} from "@/lib/share";

const DURATION_OPTIONS: Option<LinkDuration>[] = LINK_DURATIONS.map(
    (duration) => ({ value: duration.value, label: duration.label }),
);

// What a link row is headed by. Deliberately not the address: a token is 43
// characters nobody can read, recognise or check, so printing it makes the
// heaviest thing on the row the one carrying the least. Copy is how the address
// leaves this dialog. What actually tells two links apart, and what anybody
// opening this came to find out, is how long each has left.
const lifetime = (state: LinkState, expires: string | null): string => {
    if (state === "revoked") return "Revoked";
    if (state === "expired") {
        return expires ? `Expired ${expires}` : "Expired";
    }
    return expires ? `Expires ${expires}` : "Never expires";
};

const Avatar = ({ image }: { image: string | null }) =>
    image ? (
        <Image
            src={image}
            alt=""
            width={24}
            height={24}
            className="size-6 shrink-0"
        />
    ) : (
        <span aria-hidden="true" className="size-6 shrink-0 bg-hairline" />
    );

// The heading carries the weight and the hint sits under it in the tertiary
// tone, so the two sections read as two things rather than as one wall of small
// grey text.
const Section = ({
    title,
    hint,
    children,
}: {
    title: string;
    hint?: string;
    children: React.ReactNode;
}) => (
    <section className="border-t border-hairline px-5 py-6 first:border-t-0 sm:px-6">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {hint && (
            <p className="mt-1 text-pretty text-xs leading-5 text-sub">
                {hint}
            </p>
        )}
        <div className="mt-4">{children}</div>
    </section>
);

// A row that holds its height whether it is reading or working, so nothing
// below it moves as a request is answered.
const ROW_CLASS =
    "flex h-12 items-center gap-3 border-b border-faint last:border-b-0";

export const ShareDialog = ({
    listId,
    listName,
    friends,
    initial,
}: {
    listId: string;
    listName: string;
    friends: Friend[];
    initial: ShareState;
}) => {
    const dismiss = useOverlayDismiss();
    const format = useLocalDateTimeFormatter();
    const [sharedWithFriends, setFriends] = useState(initial.sharedWithFriends);
    const [people, setPeople] = useState(initial.people);
    const [links, setLinks] = useState(initial.links);
    const [duration, setDuration] = useState<LinkDuration>("never");
    const [copied, setCopied] = useState<string | null>(null);
    const [confirmingRevoke, setConfirmingRevoke] = useState<ShareLink | null>(
        null,
    );
    const [isPending, startTransition] = useTransition();

    // A friend already named in the People list is not offered again, since
    // adding them twice is not a thing to be able to ask for.
    const shared = new Set(people.map((person) => person.id));
    const available = friends.filter((friend) => !shared.has(friend.id));

    const report = (result: { ok: true } | { ok: false; error: string }) => {
        if (!result.ok) toast.error(result.error);
        return result.ok;
    };

    const toggleFriends = (on: boolean) => {
        // Moved before the request and put back if it is refused, so the switch
        // answers the press rather than the round trip.
        setFriends(on);
        startTransition(async () => {
            const result = await setSharedWithFriends(listId, on);
            if (!report(result)) setFriends(!on);
        });
    };

    const addPerson = (friend: Friend) => {
        setPeople((current) => [...current, friend]);
        startTransition(async () => {
            const result = await shareWithPerson(listId, friend.id);
            if (!report(result)) {
                setPeople((current) =>
                    current.filter((person) => person.id !== friend.id),
                );
            }
        });
    };

    const removePerson = (personId: string) => {
        const removed = people;
        setPeople((current) =>
            current.filter((person) => person.id !== personId),
        );
        startTransition(async () => {
            const result = await unshareWithPerson(listId, personId);
            if (!report(result)) setPeople(removed);
        });
    };

    const copy = async (token: string) => {
        const url = `${window.location.origin}${sharePath(token)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(token);
            window.setTimeout(() => setCopied(null), 1500);
        } catch {
            // A clipboard a browser will not open is not something the dialog
            // can work around, so it says so rather than appearing to copy.
            toast.error("Could not copy the link. Select and copy it instead.");
        }
    };

    const create = () => {
        startTransition(async () => {
            const result = await createLink(listId, duration);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            setLinks((current) => [result.link, ...current]);
            // A link is made in order to be sent, so the address is on the
            // clipboard by the time the row appears.
            void copy(result.link.token);
        });
    };

    const revoke = (link: ShareLink) => {
        const before = links;
        setLinks((current) =>
            current.map((row) =>
                row.id === link.id
                    ? { ...row, revokedAt: new Date().toISOString() }
                    : row,
            ),
        );
        startTransition(async () => {
            if (!report(await revokeLink(link.id))) setLinks(before);
        });
    };

    const remove = (link: ShareLink) => {
        const before = links;
        setLinks((current) => current.filter((row) => row.id !== link.id));
        startTransition(async () => {
            if (!report(await removeLink(link.id))) setLinks(before);
        });
    };

    return (
        <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-5 border-b border-hairline px-5 sm:px-6">
                <h2
                    id={DIALOG_TITLE_ID}
                    className="min-w-0 truncate text-base font-semibold text-ink"
                >
                    Share {listName}
                </h2>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Close"
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--x] block size-4"
                    />
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {/* No hint here: the rows say "Can view", and "All friends"
                    carries the one thing about it that is not obvious. */}
                <Section title="People">
                    {friends.length === 0 ? (
                        <p className="text-sm text-sub">
                            You have no friends yet.{" "}
                            <Link
                                href="/dashboard/friends"
                                className="text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
                            >
                                Add one
                            </Link>{" "}
                            to share a list without sending a link.
                        </p>
                    ) : (
                        <>
                            <div className={`${ROW_CLASS} border-t`}>
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--users] size-5 shrink-0 text-muted"
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                    All friends
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={sharedWithFriends}
                                    aria-label="Share with all friends"
                                    onClick={() =>
                                        toggleFriends(!sharedWithFriends)
                                    }
                                    className={`focus-frame inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border p-1 transition-colors ${sharedWithFriends ? "border-accent bg-accent" : "border-tile-border bg-background"}`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`size-4 transition-transform ${sharedWithFriends ? "translate-x-4.5 bg-background" : "translate-x-0 bg-muted"}`}
                                    />
                                </button>
                            </div>

                            {people.map((person) => (
                                <div key={person.id} className={ROW_CLASS}>
                                    <Avatar image={person.image} />
                                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                        {person.name}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted">
                                        Viewer
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removePerson(person.id)}
                                        aria-label={`Stop sharing with ${person.name}`}
                                        title="Stop sharing"
                                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center text-muted transition-colors hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="icon-[lucide--x] block size-3.5"
                                        />
                                    </button>
                                </div>
                            ))}

                            {available.length > 0 && (
                                <div className="mt-4 w-full sm:max-w-xs">
                                    <CellSelect
                                        value={null}
                                        options={available.map((friend) => ({
                                            value: friend.id,
                                            label: friend.name,
                                        }))}
                                        onChange={(id) => {
                                            const friend = available.find(
                                                (one) => one.id === id,
                                            );
                                            if (friend) addPerson(friend);
                                        }}
                                        label="Share with a friend"
                                        placeholder="Add a friend"
                                        variant="form"
                                        searchable={available.length > 8}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </Section>

                <Section title="Links" hint="Anyone with the link can view.">
                    <div className="flex flex-wrap items-center gap-2">
                        <CellSelect
                            value={duration}
                            options={DURATION_OPTIONS}
                            onChange={setDuration}
                            label="When the link expires"
                            triggerLabel={`Expires ${
                                LINK_DURATIONS.find(
                                    (one) => one.value === duration,
                                )?.label ?? "never"
                            }`}
                            variant="button"
                            // Wide enough for "Expires in 30 days", the longest
                            // it can read. Held there so picking one neither
                            // clips the label nor moves the button beside it.
                            className="w-48"
                        />
                        <button
                            type="button"
                            onClick={create}
                            disabled={isPending}
                            className={primaryButtonClass}
                        >
                            Create link
                        </button>
                    </div>

                    {links.length > 0 && (
                        <ul className="mt-5 border-t border-faint">
                            {links.map((link) => {
                                const state = linkState(link);
                                const stopped = state !== "active";
                                // Null until the browser has a formatter, so the
                                // server and the first client render agree.
                                const on = link.expiresAt
                                    ? (format?.(link.expiresAt)?.date ?? null)
                                    : null;
                                const made = format?.(link.createdAt)?.date;
                                return (
                                    <li
                                        key={link.id}
                                        className="flex h-14 items-center gap-4 border-b border-faint"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span
                                                className={`block truncate text-sm ${stopped ? "text-sub" : "text-ink"}`}
                                            >
                                                {lifetime(state, on)}
                                            </span>
                                            <span className="mt-0.5 flex items-center gap-4 text-xs text-muted">
                                                {made && (
                                                    <span>Created {made}</span>
                                                )}
                                                <span className="tabular-nums">
                                                    {link.viewCount === 1
                                                        ? "1 view"
                                                        : `${link.viewCount} views`}
                                                </span>
                                            </span>
                                        </span>
                                        {/* Two slots of a fixed width rather than
                                            whatever the labels come to, so the
                                            buttons stand in two columns down
                                            the list. A row with nothing to copy
                                            leaves its first slot empty instead
                                            of sliding the second one across,
                                            and Copy holds its width when the
                                            press turns it into Copied. */}
                                        <span className="flex shrink-0 items-center gap-2">
                                            {stopped ? (
                                                <span
                                                    aria-hidden="true"
                                                    className="w-20"
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        copy(link.token)
                                                    }
                                                    className={`${secondaryButtonClass} w-20 justify-center`}
                                                >
                                                    {copied === link.token
                                                        ? "Copied"
                                                        : "Copy"}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    stopped
                                                        ? remove(link)
                                                        : setConfirmingRevoke(
                                                              link,
                                                          )
                                                }
                                                className={`${quietButtonClass} w-16 justify-end hover:text-rose`}
                                            >
                                                {stopped ? "Remove" : "Revoke"}
                                            </button>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Section>
            </div>

            <footer className="flex h-14 shrink-0 items-center justify-end border-t border-hairline px-5 sm:px-6">
                <button
                    type="button"
                    onClick={dismiss}
                    className={secondaryButtonClass}
                >
                    Done
                </button>
            </footer>

            {confirmingRevoke && (
                <ConfirmDialog
                    title="Revoke this link?"
                    detail="Anyone who has it will stop being able to open this list. This cannot be undone, but you can create a new link."
                    confirmLabel="Revoke"
                    tone="danger"
                    onConfirm={() => {
                        revoke(confirmingRevoke);
                        setConfirmingRevoke(null);
                    }}
                    onCancel={() => setConfirmingRevoke(null)}
                />
            )}
        </>
    );
};
