"use client";

import {
    dangerButtonClass,
    ghostButtonClass,
    primaryButtonClass,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";

// Native <dialog> rather than a hand-rolled overlay: showModal gives the focus
// trap, Escape handling, inert background and top-layer stacking for free.
export const ConfirmDialog = ({
    title,
    detail,
    confirmLabel,
    tone = "accent",
    onConfirm,
    onCancel,
}: {
    title: string;
    detail: string;
    confirmLabel: string;
    tone?: "accent" | "danger";
    onConfirm: () => void;
    onCancel: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const danger = tone === "danger";

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="confirm-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
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
                <div className="mt-5 flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={() => close(onCancel)}
                        // The safe choice takes focus so a stray Enter cannot
                        // confirm a delete.
                        autoFocus={danger}
                        className={ghostButtonClass}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => close(onConfirm)}
                        autoFocus={!danger}
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
