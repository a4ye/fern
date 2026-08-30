"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteList, updateList } from "@/app/dashboard/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import type { ListStatus } from "@/components/dashboard/data";
import { HistoryDialog } from "@/components/dashboard/history-dialog";
import {
    ghostButtonClass,
    primaryButtonClass,
} from "@/components/dashboard/table-controls";
import type { ListHistoryPage } from "@/db/history";
import {
    firstIssue,
    LIST_DESCRIPTION_MAX,
    LIST_NAME_MAX,
    listUpdateSchema,
} from "@/lib/validation";

const STATUS_OPTIONS: {
    value: ListStatus;
    label: string;
    className: string;
}[] = [
    {
        value: "active",
        label: "Active",
        className: "bg-accent-tint text-accent-deep",
    },
    {
        value: "closed",
        label: "Closed",
        className: "bg-hairline text-sub",
    },
    {
        value: "archived",
        label: "Archived",
        className: "bg-hairline text-sub",
    },
];

export const ListHeader = ({
    listId,
    name: initialName,
    description: initialDescription,
    status: initialStatus,
    history,
    defaultCurrency,
}: {
    listId: string;
    name: string;
    description: string | null;
    status: ListStatus;
    history: ListHistoryPage;
    defaultCurrency: string;
}) => {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [showingHistory, setShowingHistory] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription ?? "");
    const [status, setStatus] = useState<ListStatus>(initialStatus);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing) nameRef.current?.focus();
    }, [isEditing]);

    const startEdit = () => {
        setName(initialName);
        setDescription(initialDescription ?? "");
        setStatus(initialStatus);
        setError(null);
        setIsEditing(true);
    };

    const cancel = () => setIsEditing(false);

    const save = () => {
        const parsed = listUpdateSchema.safeParse({
            name,
            description,
            status,
        });
        if (!parsed.success) {
            setError(firstIssue(parsed.error));
            return;
        }
        setError(null);
        startTransition(async () => {
            const result = await updateList(listId, {
                name: parsed.data.name,
                description: parsed.data.description,
                status: parsed.data.status,
            });
            if (result.ok) {
                setIsEditing(false);
            } else {
                setError(result.error);
            }
        });
    };

    const handleDelete = () => {
        startTransition(async () => {
            await deleteList(listId);
            router.push("/dashboard");
        });
    };

    const onKeyDown = (event: ReactKeyboardEvent) => {
        if (event.key === "Enter") {
            event.preventDefault();
            save();
        } else if (event.key === "Escape") {
            cancel();
        }
    };

    const currentStatus =
        STATUS_OPTIONS.find((o) => o.value === initialStatus) ??
        STATUS_OPTIONS[0];

    // Reading and editing occupy the same boxes: h-8 for the 2xl name row, h-5
    // for the description, h-8 for the status row. Single-line and truncated on
    // both sides, so swapping in the inputs never moves the page. Only below
    // ~340px, where the edit controls cannot share one line, does that row grow.
    return (
        <div className="mt-4">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    {isEditing ? (
                        <input
                            ref={nameRef}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="List name"
                            aria-label="List name"
                            maxLength={LIST_NAME_MAX}
                            className="block h-8 w-full bg-transparent text-2xl font-semibold tracking-tight text-ink placeholder:text-muted focus:outline-none"
                        />
                    ) : (
                        <h1 className="h-8 truncate text-2xl font-semibold tracking-tight">
                            {initialName}
                        </h1>
                    )}
                    {isEditing ? (
                        <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Add a description (optional)"
                            aria-label="List description"
                            maxLength={LIST_DESCRIPTION_MAX}
                            className="mt-2 block h-5 w-full bg-transparent text-sm text-sub placeholder:text-muted focus:outline-none"
                        />
                    ) : (
                        <p className="mt-2 h-5 truncate text-sm text-sub">
                            {initialDescription}
                        </p>
                    )}
                </div>
                <div className="flex min-h-10 shrink-0 items-center justify-end">
                    {!isEditing && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowingHistory(true)}
                                aria-haspopup="dialog"
                                aria-expanded={showingHistory}
                                aria-label="Open list history"
                                title="History"
                                className="inline-flex h-10 min-w-10 cursor-pointer items-center justify-center gap-2 pr-2.5 pl-2 text-sm text-muted transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--history] block size-4"
                                />
                                <span className="hidden sm:inline">
                                    History
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={startEdit}
                                aria-label="Edit list details"
                                title="Edit list details"
                                className="flex size-10 cursor-pointer items-center justify-center text-muted transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--pencil] block size-4"
                                />
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmingDelete(true)}
                                aria-label="Delete list"
                                title="Delete list"
                                className="flex size-10 cursor-pointer items-center justify-center text-muted transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--trash-2] block size-4"
                                />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="mt-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
                {isEditing ? (
                    <>
                        <div className="flex shrink-0 gap-1.5">
                            {STATUS_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setStatus(opt.value)}
                                    className={`inline-flex cursor-pointer items-center px-2 py-0.5 text-xs font-medium transition-opacity ${opt.className} ${status !== opt.value ? "opacity-40" : ""}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {error && (
                            <p
                                title={error}
                                className="min-w-0 flex-1 truncate text-xs text-rose"
                            >
                                {error}
                            </p>
                        )}
                        <div className="ml-auto flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={cancel}
                                className={ghostButtonClass}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                disabled={!name.trim() || isPending}
                                className={primaryButtonClass}
                            >
                                {isPending ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </>
                ) : (
                    <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${currentStatus.className}`}
                    >
                        {currentStatus.label}
                    </span>
                )}
            </div>

            {showingHistory && (
                <HistoryDialog
                    listId={listId}
                    initialPage={history}
                    defaultCurrency={defaultCurrency}
                    onClose={() => setShowingHistory(false)}
                />
            )}

            {confirmingDelete && (
                <ConfirmDialog
                    title={`Delete ${initialName}?`}
                    detail="All applications in this list will be permanently removed. This cannot be undone."
                    confirmLabel="Delete"
                    tone="danger"
                    onConfirm={() => {
                        setConfirmingDelete(false);
                        handleDelete();
                    }}
                    onCancel={() => setConfirmingDelete(false)}
                />
            )}
        </div>
    );
};
