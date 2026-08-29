"use client";

import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
    createLocalDateTimeFormatter,
    type LocalDateTimeFormatter,
} from "@/lib/local-date-time";

const subscribeToBrowser = () => () => undefined;

export const useLocalDateTimeFormatter = (): LocalDateTimeFormatter | null => {
    const browserReady = useSyncExternalStore(
        subscribeToBrowser,
        () => true,
        () => false,
    );

    return useMemo(
        () => (browserReady ? createLocalDateTimeFormatter() : null),
        [browserReady],
    );
};

type TooltipPosition = {
    left: number;
    top: number;
    below: boolean;
};

export const LocalDateTime = ({
    dateTime,
    children,
    className = "",
    display = "provided",
    interactive = true,
}: {
    dateTime: string;
    children: ReactNode;
    className?: string;
    display?: "provided" | "date";
    interactive?: boolean;
}) => {
    const format = useLocalDateTimeFormatter();
    const labels = format?.(dateTime) ?? null;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<TooltipPosition | null>(null);
    const visible = display === "date" ? (labels?.date ?? children) : children;

    const placeTooltip = () => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const box = trigger.getBoundingClientRect();
        const below = box.top < 56;
        setPosition({
            left: Math.min(
                Math.max(box.left + box.width / 2, 136),
                window.innerWidth - 136,
            ),
            top: below ? box.bottom + 8 : box.top - 8,
            below,
        });
    };

    const show = () => {
        if (!labels) return;
        placeTooltip();
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;

        const reposition = () => placeTooltip();
        const closeOutside = (event: PointerEvent) => {
            if (!triggerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    if (!interactive) {
        return (
            <time
                dateTime={dateTime}
                title={labels?.exact}
                aria-label={labels?.exact}
                className={className}
            >
                {visible}
            </time>
        );
    }

    const toggleOnTouch = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        if (open) setOpen(false);
        else show();
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") show();
                }}
                onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") setOpen(false);
                }}
                onPointerDown={toggleOnTouch}
                onFocus={show}
                onBlur={() => setOpen(false)}
                aria-label={labels?.exact}
                aria-expanded={labels ? open : undefined}
                className={`min-w-0 cursor-help text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
            >
                <time dateTime={dateTime}>{visible}</time>
            </button>
            {open && labels && position
                ? createPortal(
                      <span
                          role="tooltip"
                          style={{
                              left: position.left,
                              top: position.top,
                              transform: position.below
                                  ? "translate(-50%, 0)"
                                  : "translate(-50%, -100%)",
                          }}
                          className="pointer-events-none fixed z-[100] max-w-64 border border-hairline bg-ink px-2.5 py-1.5 text-center text-xs leading-4 text-background shadow-sm"
                      >
                          {labels.exact}
                      </span>,
                      document.body,
                  )
                : null}
        </>
    );
};
