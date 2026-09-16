"use client";

import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
    left: number;
    top: number;
    below: boolean;
};

const EXIT_MS = 100;

// Half the tooltip's own width at its widest, which is how far from either side
// of the window its centre has to stay for the whole of it to remain on screen.
const EDGE_MARGIN = 136;

// A trigger this close to the top of the window has nothing above it to hang a
// tooltip in, so the tooltip goes underneath instead.
const FLIP_BELOW_ABOVE = 56;

// The floating label itself, without the element that opens it. The trigger is
// left to the caller because the things worth explaining are already buttons
// with their own click, disabled state and labelling, and wrapping those in
// anything would put a box in the middle of a layout that is counting on them.
export const useTooltip = <Trigger extends HTMLElement>(
    label: ReactNode | null,
) => {
    const tooltipId = useId();
    const triggerRef = useRef<Trigger>(null);
    const enterFrameRef = useRef<number | null>(null);
    const exitTimerRef = useRef<number | null>(null);
    const [open, setOpen] = useState(false);
    const [animatedOpen, setAnimatedOpen] = useState(false);
    const [position, setPosition] = useState<TooltipPosition | null>(null);

    const place = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const box = trigger.getBoundingClientRect();
        const below = box.top < FLIP_BELOW_ABOVE;
        setPosition({
            left: Math.min(
                Math.max(box.left + box.width / 2, EDGE_MARGIN),
                window.innerWidth - EDGE_MARGIN,
            ),
            top: below ? box.bottom + 8 : box.top - 8,
            below,
        });
    }, []);

    const show = () => {
        if (!label) return;
        if (exitTimerRef.current !== null) {
            window.clearTimeout(exitTimerRef.current);
            exitTimerRef.current = null;
        }
        place();
        if (open) return;

        setOpen(true);
        setAnimatedOpen(false);
        enterFrameRef.current = window.requestAnimationFrame(() => {
            setAnimatedOpen(true);
            enterFrameRef.current = null;
        });
    };

    const hide = useCallback(() => {
        if (enterFrameRef.current !== null) {
            window.cancelAnimationFrame(enterFrameRef.current);
            enterFrameRef.current = null;
        }
        if (exitTimerRef.current !== null) {
            window.clearTimeout(exitTimerRef.current);
        }
        setOpen(false);
        setAnimatedOpen(false);
        exitTimerRef.current = window.setTimeout(() => {
            setPosition(null);
            exitTimerRef.current = null;
        }, EXIT_MS);
    }, []);

    useEffect(() => {
        if (!open) return;

        const reposition = () => place();
        const closeOutside = (event: PointerEvent) => {
            if (!triggerRef.current?.contains(event.target as Node)) hide();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") hide();
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
    }, [hide, open, place]);

    useEffect(
        () => () => {
            if (enterFrameRef.current !== null) {
                window.cancelAnimationFrame(enterFrameRef.current);
            }
            if (exitTimerRef.current !== null) {
                window.clearTimeout(exitTimerRef.current);
            }
        },
        [],
    );

    // A touch has no hover to read, and the trigger usually does something of
    // its own when tapped, so a tap is left to the trigger.
    const triggerProps = {
        ref: triggerRef,
        onPointerEnter: (event: ReactPointerEvent<Trigger>) => {
            if (event.pointerType === "mouse") show();
        },
        onPointerLeave: (event: ReactPointerEvent<Trigger>) => {
            if (event.pointerType === "mouse") hide();
        },
        onFocus: show,
        onBlur: hide,
    };

    const tooltip =
        label && position
            ? createPortal(
                  <span
                      id={tooltipId}
                      role="tooltip"
                      aria-hidden={!open}
                      style={{
                          // Pinned to the left of the window and carried across
                          // by the transform, rather than offset with `left`. A
                          // box positioned near the right edge may only grow as
                          // wide as the gap it has left there, so setting `left`
                          // to a trigger over that way squeezes the label into a
                          // narrow column before the transform ever moves it.
                          left: 0,
                          top: position.top,
                          transform: `translate(calc(${position.left}px - 50%), ${
                              position.below
                                  ? animatedOpen
                                      ? "0"
                                      : "-2px"
                                  : animatedOpen
                                    ? "-100%"
                                    : "calc(-100% + 2px)"
                          }) scale(${animatedOpen ? 1 : 0.98})`,
                      }}
                      className={`pointer-events-none fixed z-[100] max-w-64 border border-hairline bg-ink px-2.5 py-1.5 text-center text-xs leading-4 text-background shadow-sm transition-[opacity,transform] motion-reduce:transition-none ${position.below ? "origin-top" : "origin-bottom"} ${animatedOpen ? "opacity-100 duration-150 ease-out" : "opacity-0 duration-100 ease-in"}`}
                  >
                      {label}
                  </span>,
                  document.body,
              )
            : null;

    return { triggerProps, tooltip, tooltipId, open, show, hide };
};
