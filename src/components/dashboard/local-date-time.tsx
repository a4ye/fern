"use client";

import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useMemo,
    useSyncExternalStore,
} from "react";
import {
    createLocalDateTimeFormatter,
    type LocalDateTimeFormatter,
} from "@/lib/local-date-time";
import { useTooltip } from "@/components/dashboard/tooltip";

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
    const visible = display === "date" ? (labels?.date ?? children) : children;
    const { triggerProps, tooltip, open, show, hide } =
        useTooltip<HTMLButtonElement>(labels?.exact ?? null);

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
        if (open) hide();
        else show();
    };

    return (
        <>
            <button
                {...triggerProps}
                type="button"
                onPointerDown={toggleOnTouch}
                aria-label={labels?.exact}
                aria-expanded={labels ? open : undefined}
                className={`min-w-0 cursor-help text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
            >
                <time dateTime={dateTime}>{visible}</time>
            </button>
            {tooltip}
        </>
    );
};
