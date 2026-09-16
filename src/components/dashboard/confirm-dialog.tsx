"use client";

import { useState } from "react";
import {
    dangerButtonClass,
    formInputClass,
    ghostButtonClass,
    primaryButtonClass,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";

// Native <dialog> rather than a hand-rolled overlay: showModal gives the focus
// trap, Escape handling, inert background and top-layer stacking for free.
//
// `confirmPhrase` is for the few actions that take away more than the work in
// front of you. Having to write the word costs a second and rules out the
// reflex of clicking through a dialog that was expected to say something else.
export const ConfirmDialog = ({
    title,
    detail,
    confirmLabel,
    confirmPhrase,
    tone = "accent",
    onConfirm,
    onCancel,
}: {
    title: string;
    detail: string;
    confirmLabel: string;
    confirmPhrase?: string;
    tone?: "accent" | "danger";
    onConfirm: () => void;
    onCancel: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const [typed, setTyped] = useState("");
    const danger = tone === "danger";
    const unlocked =
        !confirmPhrase ||
        typed.trim().toLowerCase() === confirmPhrase.toLowerCase();

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="confirm-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                // React walks the fiber tree for `cancel` even though the DOM
                // event never bubbles, so an Escape in here would otherwise
                // also close the dialog this one confirms against.
                event.stopPropagation();
                close(onCancel);
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) close(onCancel);
            }}
            className="m-auto w-88 max-w-[calc(100vw-2rem)] border-0 bg-background p-0 backdrop:bg-ink/25"
        >
            <div
                className={`h-0.75 ${danger ? "bg-rose" : "bg-accent"}`}
                aria-hidden="true"
            />
            <div className="border-x border-b border-hairline px-5 py-4">
                <h2
                    id="confirm-dialog-title"
                    className="text-sm font-semibold text-ink"
                >
                    {title}
                </h2>
                <p className="mt-1.5 text-xs text-sub">{detail}</p>
                {confirmPhrase && (
                    <label className="mt-4 block">
                        <span className="text-xs text-sub">
                            Type{" "}
                            <strong className="font-medium text-ink">
                                {confirmPhrase}
                            </strong>{" "}
                            to confirm.
                        </span>
                        <input
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoFocus
                            autoComplete="off"
                            className={`${formInputClass} mt-1.5`}
                        />
                    </label>
                )}
                <div className="mt-5 flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={() => close(onCancel)}
                        // The safe choice takes focus so a stray Enter cannot
                        // confirm a delete. A phrase takes it instead, since
                        // until it is written there is nothing to confirm with.
                        autoFocus={danger && !confirmPhrase}
                        className={ghostButtonClass}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => close(onConfirm)}
                        autoFocus={!danger}
                        disabled={!unlocked}
                        className={
                            danger ? dangerButtonClass : primaryButtonClass
                        }
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </dialog>
    );
};
