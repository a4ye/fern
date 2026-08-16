"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type DownloadFormat<T extends string> = {
    id: T;
    label: string;
    icon: string;
    // Only where the extension alone leaves the choice open, as PNG against SVG
    // does. A list of file formats says what it is without being annotated.
    note?: string;
};

const Choice = <T extends string>({
    format,
    onSelect,
}: {
    format: DownloadFormat<T>;
    onSelect: () => void;
}) => (
    <button
        type="button"
        role="menuitem"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-center gap-2.5 border-b border-faint px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface"
    >
        <span
            aria-hidden="true"
            className={`${format.icon} size-4 shrink-0 text-muted`}
        />
        <span className="min-w-0">
            <span className="block text-xs font-medium text-ink">
                {format.label}
            </span>
            {format.note && (
                <span className="block text-xs text-sub">{format.note}</span>
            )}
        </span>
    </button>
);

// The trigger is the caller's: the chart header wants a bare icon, the table's
// bar wants a labelled button beside the ones already on it.
export const DownloadMenu = <T extends string>({
    title,
    heading,
    formats,
    busy = false,
    className = "",
    triggerClass,
    children,
    onSelect,
}: {
    title: string;
    heading: string;
    formats: readonly DownloadFormat<T>[];
    busy?: boolean;
    className?: string;
    triggerClass: string;
    children: ReactNode;
    onSelect: (format: T) => void;
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    return (
        <div
            ref={menuRef}
            onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
            className={`relative ${className}`}
        >
            <button
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={title}
                title={title}
                className={triggerClass}
            >
                {children}
            </button>
            {open && (
                <div
                    role="menu"
                    aria-label={title}
                    className="absolute top-full right-0 z-30 mt-1 w-max min-w-32 border border-hairline bg-background shadow-sm"
                >
                    <p className="border-b border-hairline px-3 py-1.5 text-xs font-medium text-muted">
                        {heading}
                    </p>
                    {formats.map((format) => (
                        <Choice
                            key={format.id}
                            format={format}
                            onSelect={() => {
                                setOpen(false);
                                onSelect(format.id);
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
