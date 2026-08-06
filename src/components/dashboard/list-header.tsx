"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteList, updateList } from "@/app/dashboard/actions";
import type { ListStatus } from "@/components/dashboard/data";
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
}: {
    listId: string;
    name: string;
    description: string | null;
    status: ListStatus;
}) => {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
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

    if (isEditing) {
        return (
            <div className="mt-4">
                <input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="List name"
                    aria-label="List name"
                    maxLength={LIST_NAME_MAX}
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight text-ink placeholder:text-muted focus:outline-none"
                />
                <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Add a description (optional)"
                    aria-label="List description"
                    maxLength={LIST_DESCRIPTION_MAX}
                    className="mt-2 w-full bg-transparent text-sm text-sub placeholder:text-muted focus:outline-none"
                />
                {error && <p className="mt-2 text-xs text-rose">{error}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="flex gap-1.5">
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
                    <div className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            onClick={cancel}
                            className="inline-flex h-8 cursor-pointer items-center px-3 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            disabled={!name.trim() || isPending}
                            className="inline-flex h-8 cursor-pointer items-center bg-accent px-3 text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                        >
                            {isPending ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isDeleting) {
        return (
            <div className="mt-4">
                <p className="text-2xl font-semibold tracking-tight">
                    {initialName}
                </p>
                <p className="mt-2 text-sm text-sub">
                    Delete this list? All applications will be permanently
                    removed. This cannot be undone.
                </p>
                <div className="mt-3 flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={() => setIsDeleting(false)}
                        className="inline-flex h-8 cursor-pointer items-center px-3 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="inline-flex h-8 cursor-pointer items-center bg-rose px-3 text-sm font-medium text-background transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isPending ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    {initialName}
                </h1>
                {initialDescription && (
                    <p className="mt-2 text-sm text-sub">
                        {initialDescription}
                    </p>
                )}
                <span
                    className={`mt-2 inline-flex items-center px-2 py-0.5 text-xs font-medium ${currentStatus.className}`}
                >
                    {currentStatus.label}
                </span>
            </div>
            <div className="mt-1 flex shrink-0 items-center">
                <button
                    type="button"
                    onClick={startEdit}
                    aria-label="Edit list details"
                    title="Edit list details"
                    className="cursor-pointer p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--pencil] block size-4"
                    />
                </button>
                <button
                    type="button"
                    onClick={() => setIsDeleting(true)}
                    aria-label="Delete list"
                    title="Delete list"
                    className="cursor-pointer p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--trash-2] block size-4"
                    />
                </button>
            </div>
        </div>
    );
};
