"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    acceptFriendRequest,
    removeFriend,
    sendFriendRequest,
} from "@/app/dashboard/sharing-actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import {
    ghostButtonClass,
    primaryButtonClass,
    quietButtonClass,
} from "@/components/dashboard/table-controls";
import type { Friend, FriendsPage } from "@/db/friends";

const Avatar = ({ image }: { image: string | null }) =>
    image ? (
        <Image
            src={image}
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0"
        />
    ) : (
        <span aria-hidden="true" className="size-8 shrink-0 bg-hairline" />
    );

// One height for every row whatever buttons it carries, so the three groups
// read as one column and accepting a request does not shuffle the page.
const Row = ({
    friend,
    children,
}: {
    friend: Friend;
    children: React.ReactNode;
}) => (
    <li className="flex h-14 items-center gap-3 border-b border-faint px-5 last:border-b-0">
        <Avatar image={friend.image} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {friend.name}
        </span>
        <span className="flex shrink-0 items-center gap-1">{children}</span>
    </li>
);

const Group = ({
    title,
    count,
    children,
}: {
    title: string;
    count: number;
    children: React.ReactNode;
}) => {
    if (count === 0) return null;
    return (
        <section className="mt-8">
            <h2 className="flex items-baseline gap-2 text-xs font-medium text-muted">
                {title}
                <span className="text-sub tabular-nums">{count}</span>
            </h2>
            <ul className="mt-3 border border-hairline bg-background">
                {children}
            </ul>
        </section>
    );
};

export const FriendsManager = ({
    page,
    username,
}: {
    page: FriendsPage;
    // The handle to give somebody who wants to add you. Null when GitHub could
    // not be reached, in which case the line that offers it is left out rather
    // than shown empty.
    username: string | null;
}) => {
    const router = useRouter();
    const [handle, setHandle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [removing, setRemoving] = useState<Friend | null>(null);
    // Two transitions rather than one. Sharing a single pending flag put the
    // Send request button back into "Sending..." whenever a row below it was
    // answered, which reads as the form having restarted on its own.
    const [sending, startSending] = useTransition();
    const [answering, startAnswering] = useTransition();

    // Every change here moves a person between the three groups, and which
    // group they land in is the server's answer rather than a guess worth
    // making. So none of this is optimistic: the action revalidates and the
    // page is re-read, which is also what keeps two browsers from disagreeing
    // about a request that was answered in one of them.

    const add = () => {
        const trimmed = handle.trim();
        if (!trimmed || sending) return;
        setError(null);
        startSending(async () => {
            const result = await sendFriendRequest(trimmed);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setHandle("");
            toast.success(`Request sent to ${trimmed}.`);
            router.refresh();
        });
    };

    const accept = (friend: Friend) => {
        startAnswering(async () => {
            const result = await acceptFriendRequest(friend.friendshipId);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            router.refresh();
        });
    };

    const drop = (friend: Friend, message: string) => {
        startAnswering(async () => {
            const result = await removeFriend(friend.friendshipId);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            toast.success(message);
            router.refresh();
        });
    };

    return (
        <>
            <section className="mt-8">
                <h2 className="text-xs font-medium text-muted">Add a friend</h2>
                <p className="mt-1 text-pretty text-xs leading-5 text-sub">
                    Add friends to share lists with each other without creating
                    a public link.
                    {username && (
                        <>
                            {" "}
                            Your GitHub username is{" "}
                            <span className="bg-hairline px-1.5 py-0.5 text-xs font-medium text-ink">
                                {username}
                            </span>
                            .
                        </>
                    )}
                </p>
                <div className="mt-3 flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1 sm:max-w-xs">
                        <input
                            value={handle}
                            onChange={(event) => {
                                setHandle(event.target.value);
                                setError(null);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    add();
                                }
                            }}
                            placeholder="GitHub username"
                            aria-label="GitHub username"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={39}
                            // h-8 and text-sm to match the button beside it.
                            // formInputClass takes its height from its padding
                            // and sets text-xs, so the two did not line up.
                            className="focus-frame h-8 w-full border border-hairline bg-background px-2.5 text-sm text-ink transition-colors placeholder:text-muted hover:border-tile-border"
                        />
                        {/* Held below the field rather than beside it, so a
                            long message does not push the button off the line
                            it shares with the input. */}
                        <p className="mt-1.5 h-4 truncate text-xs text-rose">
                            {error}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={add}
                        disabled={!handle.trim() || sending}
                        // Held at the width of the longer of its two labels, so
                        // pressing it does not shrink it.
                        className={`${primaryButtonClass} w-32 justify-center`}
                    >
                        {sending ? "Sending" : "Send request"}
                    </button>
                </div>
            </section>

            <Group title="Requests received" count={page.incoming.length}>
                {page.incoming.map((friend) => (
                    <Row key={friend.friendshipId} friend={friend}>
                        <button
                            type="button"
                            onClick={() =>
                                drop(friend, `Declined ${friend.name}.`)
                            }
                            disabled={answering}
                            className={ghostButtonClass}
                        >
                            Decline
                        </button>
                        <button
                            type="button"
                            onClick={() => accept(friend)}
                            disabled={answering}
                            className={primaryButtonClass}
                        >
                            Accept
                        </button>
                    </Row>
                ))}
            </Group>

            <Group title="Requests sent" count={page.outgoing.length}>
                {page.outgoing.map((friend) => (
                    <Row key={friend.friendshipId} friend={friend}>
                        <span className="text-xs text-muted">Waiting</span>
                        <button
                            type="button"
                            onClick={() =>
                                drop(friend, `Cancelled the request.`)
                            }
                            disabled={answering}
                            className={`${quietButtonClass} ml-2 hover:text-rose`}
                        >
                            Cancel
                        </button>
                    </Row>
                ))}
            </Group>

            <Group title="Friends" count={page.friends.length}>
                {page.friends.map((friend) => (
                    <Row key={friend.friendshipId} friend={friend}>
                        <button
                            type="button"
                            onClick={() => setRemoving(friend)}
                            disabled={answering}
                            className={`${quietButtonClass} hover:text-rose`}
                        >
                            Remove
                        </button>
                    </Row>
                ))}
            </Group>

            {page.friends.length === 0 &&
                page.incoming.length === 0 &&
                page.outgoing.length === 0 && (
                    <p className="mt-8 border border-hairline bg-background px-5 py-16 text-center text-sm text-sub">
                        You have no friends yet :(
                    </p>
                )}

            {removing && (
                <ConfirmDialog
                    title={`Remove ${removing.name}?`}
                    detail="Any list you shared with them, and any they shared with you, will stop being readable by the other."
                    confirmLabel="Remove"
                    tone="danger"
                    onConfirm={() => {
                        drop(removing, `Removed ${removing.name}.`);
                        setRemoving(null);
                    }}
                    onCancel={() => setRemoving(null)}
                />
            )}
        </>
    );
};
