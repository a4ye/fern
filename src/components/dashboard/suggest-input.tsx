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
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const SEARCH_DELAY_MS = 180;
const MAX_OPTIONS = 8;
const POPUP_GAP = 4;
const POPUP_EDGE = 8;
const POPUP_MAX_HEIGHT = 288;

type Search = (value: string) => Promise<string[]>;

// A cache per search rather than one for the module, so two inputs looking up
// different things can never answer each other's queries.
const caches = new WeakMap<Search, Map<string, string[]>>();

const cacheFor = (search: Search): Map<string, string[]> => {
    const existing = caches.get(search);
    if (existing) return existing;
    const cache = new Map<string, string[]>();
    caches.set(search, cache);
    return cache;
};

const remember = (
    cache: Map<string, string[]>,
    query: string,
    results: string[],
) => {
    if (cache.size >= 100) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
    }
    cache.set(query, results);
};

type Placement = {
    host: HTMLElement;
    style: CSSProperties;
    maxHeight: number;
};

type Choice =
    { kind: "suggestion"; value: string } | { kind: "custom"; value: string };

const defaultNormalize = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

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

const unique = (
    groups: readonly (readonly string[])[],
    normalize: (value: string) => string,
): string[] => {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const group of groups) {
        for (const value of group) {
            const key = normalize(value);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            values.push(value);
            if (values.length >= MAX_OPTIONS) return values;
        }
    }
    return values;
};

// A text field that offers what has already been named. `suggest` answers every
// keystroke on its own, and `search` is for the far larger list that only a
// server holds: it runs behind a debounce, and its answers are cached.
export const SuggestInput = ({
    value,
    onChange,
    className,
    label,
    maxLength,
    suggest,
    search,
    disabled = false,
    normalize = defaultNormalize,
    header,
    promoted = [],
    onDismissPromoted,
}: {
    value: string;
    onChange: (value: string) => void;
    className: string;
    // Names the list for a screen reader, as in "Role suggestions".
    label: string;
    maxLength: number;
    suggest: (value: string, limit: number) => readonly string[];
    search?: Search;
    disabled?: boolean;
    normalize?: (value: string) => string;
    // Shown above suggestions that were put forward rather than typed towards.
    header?: ReactNode;
    promoted?: readonly string[];
    onDismissPromoted?: () => void;
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
    const cache = search ? cacheFor(search) : null;
    const query = normalize(value);
    const offered = useMemo(
        () => suggest(value, MAX_OPTIONS),
        [suggest, value],
    );
    const suggestions = useMemo(() => {
        const cached = cache?.get(query);
        const settled =
            cached ?? (remote.query === query ? remote.options : null);
        return unique([promoted, settled ?? offered], normalize);
    }, [cache, normalize, offered, promoted, query, remote]);
    const customValue = value.trim();
    const hasExactSuggestion = suggestions.some(
        (suggestion) => normalize(suggestion) === query,
    );
    const choices = useMemo<Choice[]>(
        () => [
            ...suggestions.map((suggestion): Choice => ({
                kind: "suggestion",
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
    const putForward = promoted.length > 0;
    const open =
        !disabled &&
        closedQuery !== query &&
        choices.length > 0 &&
        (putForward || (focused && editing));
    const loading =
        focused &&
        editing &&
        !disabled &&
        cache !== null &&
        query.length >= 2 &&
        remote.query !== query &&
        !cache.has(query);

    useEffect(() => {
        if (
            !search ||
            !cache ||
            !focused ||
            !editing ||
            query.length < 2 ||
            disabled
        ) {
            return;
        }

        if (cache.has(query)) return;

        const currentRequest = requestId.current + 1;
        requestId.current = currentRequest;
        const timer = window.setTimeout(() => {
            void search(value.trim())
                .then((options) => {
                    if (requestId.current !== currentRequest) return;
                    remember(cache, query, options);
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
    }, [cache, disabled, editing, focused, query, search, value]);

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

    const select = (choice: Choice) => {
        if (choice.kind === "suggestion") onChange(choice.value);
        onDismissPromoted?.();
        setClosedQuery(normalize(choice.value));
        setEditing(false);
        setActive(-1);
        inputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            onDismissPromoted?.();
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
                    onDismissPromoted?.();
                    onChange(event.target.value);
                }}
                onFocus={() => {
                    setFocused(true);
                    if (!value.trim()) setEditing(true);
                }}
                onBlur={() => setFocused(false)}
                onKeyDown={onKeyDown}
                maxLength={maxLength}
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
                        {putForward && header}
                        <ul
                            id={listId}
                            role="listbox"
                            aria-label={`${label} suggestions`}
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
                                                ? `${putForward ? "Keep as posted" : "Keep as entered"}: “${choice.value}”`
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
