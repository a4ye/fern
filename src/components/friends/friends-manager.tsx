"use client";

import { startTransition, useOptimistic, useState, useTransition } from "react";
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
import { usePendingRequests } from "@/components/dashboard/pending-requests";
import { useViewing } from "@/components/dashboard/viewing";
import { answered, type Answer } from "@/components/friends/answered";
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
    const viewing = useViewing();
    const [handle, setHandle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [removing, setRemoving] = useState<Friend | null>(null);
    // Answering a row has no pending flag of its own: the row it acts on leaves
    // its group on the press, so there is nothing left to show as busy. Sending
    // still needs one, since the form stays put while GitHub is looked up.
    const [sending, startSending] = useTransition();

    // Rows move on the press rather than on the answer. Which group a row lands
    // in is the one thing about this page worth guessing at, because it follows
    // from the button that was pressed, and the guess is dropped for the
    // server's own answer the moment the action revalidates. The actions stay
    // scoped to their friendship, so a request answered in another browser is
    // still settled by the server rather than by what was drawn here.
    const [shown, answer] = useOptimistic(page, answered);
    const { showPending } = usePendingRequests();

    // Both guesses are made together. The friends icon in the top bar counts the
    // same requests this page lists, so leaving it on the server's number would
    // have it contradict the group heading right below it for the length of the
    // round trip.
    const guess = (action: Answer) => {
        answer(action);
        showPending(answered(shown, action).incoming.length);
    };

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
        startTransition(async () => {
            guess({ kind: "accept", friendshipId: friend.friendshipId });
            const result = await acceptFriendRequest(friend.friendshipId);
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            router.refresh();
        });
    };

    const drop = (friend: Friend, message: string) => {
        startTransition(async () => {
            guess({ kind: "remove", friendshipId: friend.friendshipId });
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
            {viewing ? null : (
                <section className="mt-8">
                    <h2 className="text-xs font-medium text-muted">
                        Add a friend
                    </h2>
                    <p className="mt-1 text-pretty text-xs leading-5 text-sub">
                        Add friends to share lists with each other without
                        creating a public link.
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
            )}

            <Group title="Requests received" count={shown.incoming.length}>
                {shown.incoming.map((friend) => (
                    <Row key={friend.friendshipId} friend={friend}>
                        {viewing ? null : (
                            <>
                                <button
                                    type="button"
                                    onClick={() =>
                                        drop(friend, `Declined ${friend.name}.`)
                                    }
                                    className={ghostButtonClass}
                                >
                                    Decline
                                </button>
                                <button
                                    type="button"
                                    onClick={() => accept(friend)}
                                    className={primaryButtonClass}
                                >
                                    Accept
                                </button>
                            </>
                        )}
                    </Row>
                ))}
            </Group>

            <Group title="Requests sent" count={shown.outgoing.length}>
                {shown.outgoing.map((friend) => (
                    <Row key={friend.friendshipId} friend={friend}>
                        <span className="text-xs text-muted">Waiting</span>
                        {viewing ? null : (
                            <button
                                type="button"
                                onClick={() =>
                                    drop(friend, `Cancelled the request.`)
                                }
                                className={`${quietButtonClass} ml-2 hover:text-rose`}
                            >
                                Cancel
                            </button>
                        )}
                    </Row>
                ))}
            </Group>

            <Group title="Friends" count={shown.friends.length}>
                {shown.friends.map((friend) => (
                    <Row key={friend.friendshipId} friend={friend}>
                        {viewing ? null : (
                            <button
                                type="button"
                                onClick={() => setRemoving(friend)}
                                className={`${quietButtonClass} hover:text-rose`}
                            >
                                Remove
                            </button>
                        )}
                    </Row>
                ))}
            </Group>

            {shown.friends.length === 0 &&
                shown.incoming.length === 0 &&
                shown.outgoing.length === 0 && (
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
