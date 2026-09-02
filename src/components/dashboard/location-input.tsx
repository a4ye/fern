"use client";

import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { searchImportedLocations } from "@/app/dashboard/actions";
import {
    normalizeLocationPhrase,
    searchPopularLocations,
} from "@/lib/job-import/location";
import { LOCATION_MAX } from "@/lib/validation";

const SEARCH_DELAY_MS = 180;
const MAX_OPTIONS = 8;
const POPUP_GAP = 4;
const POPUP_EDGE = 8;
const POPUP_MAX_HEIGHT = 288;
const queryCache = new Map<string, string[]>();

type Placement = {
    host: HTMLElement;
    style: CSSProperties;
    maxHeight: number;
};

type LocationChoice =
    { kind: "location"; value: string } | { kind: "custom"; value: string };

const rememberQuery = (query: string, results: string[]) => {
    if (queryCache.size >= 100) {
        const oldest = queryCache.keys().next().value;
        if (oldest) queryCache.delete(oldest);
    }
    queryCache.set(query, results);
};

const popupHost = (input: HTMLInputElement): HTMLElement =>
    input.closest("dialog") ?? document.body;

const shiftsFixedOrigin = (host: HTMLElement): boolean => {
    if (host === document.body) return false;
    const style = getComputedStyle(host);
    return (
        style.transform !== "none" ||
        style.filter !== "none" ||
        style.perspective !== "none" ||
        style.getPropertyValue("scale") !== "none" ||
        style.getPropertyValue("translate") !== "none" ||
        style.getPropertyValue("rotate") !== "none"
    );
};

const placementFor = (input: HTMLInputElement): Placement => {
    const rect = input.getBoundingClientRect();
    const host = popupHost(input);
    const below = window.innerHeight - rect.bottom - POPUP_GAP - POPUP_EDGE;
    const above = rect.top - POPUP_GAP - POPUP_EDGE;
    const opensAbove = below < Math.min(POPUP_MAX_HEIGHT, above);
    const maxHeight = Math.max(
        80,
        Math.min(POPUP_MAX_HEIGHT, opensAbove ? above : below),
    );
    let left = Math.min(rect.left, window.innerWidth - rect.width - POPUP_EDGE);
    let top = opensAbove ? undefined : rect.bottom + POPUP_GAP;
    let bottom = opensAbove
        ? window.innerHeight - rect.top + POPUP_GAP
        : undefined;

    if (shiftsFixedOrigin(host)) {
        const origin = host.getBoundingClientRect();
        left -= origin.left;
        if (top !== undefined) top -= origin.top;
        if (bottom !== undefined) {
            bottom += origin.bottom - window.innerHeight;
        }
    }

    return {
        host,
        maxHeight,
        style: {
            left,
            width: rect.width,
            ...(top === undefined ? { bottom } : { top }),
        },
    };
};

const uniqueLocations = (groups: readonly (readonly string[])[]): string[] => {
    const seen = new Set<string>();
    const locations: string[] = [];
    for (const group of groups) {
        for (const location of group) {
            const key = normalizeLocationPhrase(location);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            locations.push(location);
            if (locations.length >= MAX_OPTIONS) return locations;
        }
    }
    return locations;
};

export const LocationInput = ({
    value,
    onChange,
    className,
    disabled = false,
    promotedSuggestions = [],
    onDismissPromotedSuggestions,
}: {
    value: string;
    onChange: (value: string) => void;
    className: string;
    disabled?: boolean;
    promotedSuggestions?: readonly string[];
    onDismissPromotedSuggestions?: () => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const requestId = useRef(0);
    const listId = useId();
    const [focused, setFocused] = useState(false);
    const [editing, setEditing] = useState(false);
    const [active, setActive] = useState(-1);
    const [closedQuery, setClosedQuery] = useState<string | null>(null);
    const [placement, setPlacement] = useState<Placement | null>(null);
    const [remote, setRemote] = useState<{
        query: string;
        options: string[];
    }>({ query: "", options: [] });
    const query = normalizeLocationPhrase(value);
    const popular = useMemo(
        () => searchPopularLocations(value, MAX_OPTIONS),
        [value],
    );
    const suggestions = useMemo(
        () =>
            uniqueLocations([
                promotedSuggestions,
                popular,
                queryCache.get(query) ??
                    (remote.query === query ? remote.options : []),
            ]),
        [promotedSuggestions, popular, query, remote],
    );
    const customValue = value.trim();
    const hasExactSuggestion = suggestions.some(
        (suggestion) => normalizeLocationPhrase(suggestion) === query,
    );
    const choices = useMemo<LocationChoice[]>(
        () => [
            ...suggestions.map((suggestion): LocationChoice => ({
                kind: "location",
                value: suggestion,
            })),
            ...(customValue && !hasExactSuggestion
                ? [
                      {
                          kind: "custom" as const,
                          value: customValue,
                      },
                  ]
                : []),
        ],
        [customValue, hasExactSuggestion, suggestions],
    );
    const promoted = promotedSuggestions.length > 0;
    const open =
        !disabled &&
        closedQuery !== query &&
        choices.length > 0 &&
        (promoted || (focused && editing));
    const loading =
        focused &&
        editing &&
        query.length >= 2 &&
        !disabled &&
        remote.query !== query &&
        !queryCache.has(query);

    useEffect(() => {
        if (!focused || !editing || query.length < 2 || disabled) {
            return;
        }

        const cached = queryCache.get(query);
        if (cached) return;

        const currentRequest = requestId.current + 1;
        requestId.current = currentRequest;
        const timer = window.setTimeout(() => {
            void searchImportedLocations(value.trim())
                .then((options) => {
                    if (requestId.current !== currentRequest) return;
                    rememberQuery(query, options);
                    setRemote({ query, options });
                })
                .catch(() => {
                    if (requestId.current !== currentRequest) return;
                    setRemote({ query, options: [] });
                });
        }, SEARCH_DELAY_MS);
        return () => {
            window.clearTimeout(timer);
            if (requestId.current === currentRequest) {
                requestId.current += 1;
            }
        };
    }, [disabled, editing, focused, query, value]);

    const place = useCallback(() => {
        const input = inputRef.current;
        if (input) setPlacement(placementFor(input));
    }, []);

    useLayoutEffect(() => {
        if (!open) return;
        place();
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [open, choices.length, place]);
    const activeIndex = active < choices.length ? active : -1;

    const close = () => {
        setClosedQuery(query);
        setActive(-1);
        setEditing(false);
    };

    const select = (choice: LocationChoice) => {
        if (choice.kind === "location") onChange(choice.value);
        onDismissPromotedSuggestions?.();
        setClosedQuery(normalizeLocationPhrase(choice.value));
        setEditing(false);
        setActive(-1);
        inputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            onDismissPromotedSuggestions?.();
            close();
            return;
        }
        if (!open || choices.length === 0) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActive((current) => {
                if (current < 0) {
                    return direction > 0 ? 0 : choices.length - 1;
                }
                return (current + direction + choices.length) % choices.length;
            });
        } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            event.stopPropagation();
            select(choices[activeIndex]);
        }
    };

    return (
        <div className="relative min-w-0 flex-1">
            <input
                ref={inputRef}
                value={value}
                onChange={(event) => {
                    setEditing(true);
                    setClosedQuery(null);
                    setActive(-1);
                    onDismissPromotedSuggestions?.();
                    onChange(event.target.value);
                }}
                onFocus={() => {
                    setFocused(true);
                    if (!value.trim()) setEditing(true);
                }}
                onBlur={() => setFocused(false)}
                onKeyDown={onKeyDown}
                maxLength={LOCATION_MAX}
                disabled={disabled}
                role="combobox"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={
                    open && activeIndex >= 0
                        ? `${listId}-${activeIndex}`
                        : undefined
                }
                aria-busy={loading}
                className={`${className} pr-8`}
            />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2.5 icon-[lucide--search] size-3.5 -translate-y-1/2 text-muted"
            />
            {open &&
                placement &&
                createPortal(
                    <div
                        data-open
                        style={{
                            ...placement.style,
                            maxHeight: placement.maxHeight,
                        }}
                        className="popup fixed z-50 flex-col bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.08),0_4px_10px_rgba(0,0,0,0.08)]"
                    >
                        {promoted && (
                            <p
                                role="status"
                                className="flex shrink-0 items-start gap-2 border-b border-faint bg-surface px-3 py-2.5 text-pretty text-xs text-sub"
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--map-pin] mt-px size-3.5 shrink-0 text-accent-deep"
                                />
                                Which location did the posting mean?
                            </p>
                        )}
                        <ul
                            id={listId}
                            role="listbox"
                            aria-label="Location suggestions"
                            aria-busy={loading}
                            className="min-h-0 overflow-y-auto"
                        >
                            {choices.map((choice, index) => {
                                const isCustom = choice.kind === "custom";
                                return (
                                    <li
                                        key={`${choice.kind}-${choice.value}`}
                                        id={`${listId}-${index}`}
                                        role="option"
                                        aria-selected={activeIndex === index}
                                        onPointerDown={(event) =>
                                            event.preventDefault()
                                        }
                                        onPointerMove={() => setActive(index)}
                                        onClick={() => select(choice)}
                                        className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 border-b border-faint px-3 py-2 text-left text-xs transition-[background-color,color,scale] active:scale-[0.96] ${
                                            activeIndex === index
                                                ? "bg-surface text-accent-deep"
                                                : "text-ink hover:bg-surface hover:text-accent-deep"
                                        }`}
                                    >
                                        <span className="min-w-0 text-pretty">
                                            {isCustom
                                                ? `${promoted ? "Keep as posted" : "Keep as entered"}: “${choice.value}”`
                                                : choice.value}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className={`${isCustom ? "icon-[lucide--text-cursor-input]" : "icon-[lucide--arrow-right]"} size-3.5 shrink-0 text-muted`}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>,
                    placement.host,
                )}
        </div>
    );
};
