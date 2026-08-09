"use client";

import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    STATUS_KEYWORDS,
    STATUS_META,
    arrangementLabel,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import { searchScore } from "@/lib/fuzzy";

// Bulk mode turns every cell of every row into a field, so borders on all of
// them would be noise; cells read as plain text until hovered or focused. Rows
// carry a fixed height, so swapping cells for fields never changes the shape of
// the table.
export const cellFieldClass =
    "h-6 w-full min-w-0 border border-transparent bg-transparent px-1.5 text-xs text-ink transition-colors placeholder:text-muted hover:border-hairline focus:border-tile-border focus:bg-background focus:outline-none";

// A single row being edited is an isolated form, so every field is drawn as one.
// Without this the row shows a border on the focused cell alone and reads as
// half-broken rather than editable.
export const editFieldClass =
    "h-7 w-full min-w-0 border border-hairline bg-background px-1.5 text-xs text-ink transition-colors placeholder:text-muted hover:border-tile-border focus:border-accent focus:outline-none";

export const formInputClass =
    "w-full border border-hairline bg-background px-2.5 py-1.5 text-xs text-ink transition-colors placeholder:text-muted focus:border-accent focus:outline-none";

export const checkboxClass =
    "size-3.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const ghostButtonClass =
    "inline-flex h-8 cursor-pointer items-center px-3 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const primaryButtonClass =
    "inline-flex h-8 cursor-pointer items-center bg-accent px-3 text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent";

export const secondaryButtonClass =
    "inline-flex h-8 cursor-pointer items-center gap-1.5 border border-hairline bg-background px-3 text-sm text-ink transition-colors hover:border-tile-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const dangerButtonClass =
    "inline-flex h-8 cursor-pointer items-center bg-rose px-3 text-sm font-medium text-background transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const quietButtonClass =
    "inline-flex cursor-pointer items-center gap-1.5 text-xs text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// `keywords` are searched but never shown, so an option can be found by what it
// means as well as by what it is called.
export type Option<T> = {
    value: T;
    label: string;
    text?: string;
    keywords?: readonly string[];
};

// "cell" sits on the table grid and stays invisible until touched, "edit"
// matches the single-row editor, "form" the bordered inputs of the add panel.
const FIELD_CLASS = {
    cell: cellFieldClass,
    edit: editFieldClass,
    form: formInputClass,
};

export type FieldVariant = keyof typeof FIELD_CLASS;

const POPUP_MAX = 240;
const POPUP_MIN_WIDTH = 144;
const GAP = 4;
const EDGE = 8;

type Placement = { left: number; width: number } & (
    { top: number; bottom?: never } | { bottom: number; top?: never }
);

// Fixed to the viewport and portalled out of the table, which scrolls and would
// otherwise clip the popup on the last rows.
const placeFrom = (rect: DOMRect): { style: Placement; maxHeight: number } => {
    const width = Math.max(rect.width, POPUP_MIN_WIDTH);
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const left = Math.min(rect.left, window.innerWidth - width - EDGE);

    if (below < Math.min(POPUP_MAX, above)) {
        return {
            style: { left, width, bottom: window.innerHeight - rect.top + GAP },
            maxHeight: Math.min(POPUP_MAX, above),
        };
    }
    return {
        style: { left, width, top: rect.bottom + GAP },
        maxHeight: Math.min(POPUP_MAX, below),
    };
};

// A custom dropdown rather than a native <select>: the browser's native option
// popup can't be styled to match the table. Passing `placeholder` turns it into
// an action menu, where the button keeps its label instead of showing the value.
export const CellSelect = <T,>({
    value,
    options,
    onChange,
    label,
    placeholder,
    className = "",
    variant = "cell",
    searchable = false,
}: {
    value: T | null;
    options: Option<T>[];
    onChange: (value: T) => void;
    label: string;
    placeholder?: string;
    className?: string;
    variant?: FieldVariant;
    searchable?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [placed, setPlaced] = useState<ReturnType<typeof placeFrom> | null>(
        null,
    );
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();
    const current = options.find((option) => option.value === value);

    const matches = useMemo(() => {
        if (!searchable || !query.trim()) return options;
        return options
            .map((option) => ({
                option,
                score: searchScore(query, option.label, option.keywords),
            }))
            .filter((entry) => entry.score > 0)
            .sort((first, second) => second.score - first.score)
            .map((entry) => entry.option);
    }, [options, query, searchable]);

    const place = useCallback(() => {
        const trigger = triggerRef.current;
        if (trigger) setPlaced(placeFrom(trigger.getBoundingClientRect()));
    }, []);

    const close = useCallback(() => {
        setOpen(false);
        setQuery("");
        setActive(0);
    }, []);

    useEffect(() => {
        if (!open) return;
        place();

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                !triggerRef.current?.contains(target) &&
                !popupRef.current?.contains(target)
            ) {
                close();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            close();
            triggerRef.current?.focus();
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        // Capture, so the table's own scroll container keeps the popup glued.
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [open, place, close]);

    useEffect(() => {
        if (open && placed) searchRef.current?.focus();
    }, [open, placed]);

    useEffect(() => {
        listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const select = (option: Option<T>) => {
        onChange(option.value);
        close();
        // The search field is unmounting, so focus would otherwise fall to the
        // body and strand anyone moving through the row by keyboard.
        triggerRef.current?.focus();
    };

    // The row editor and the add panel both wrap this control and read Enter as
    // save and Escape as cancel. Enter on the trigger is how a keyboard user
    // opens the dropdown, and Escape is how they close it, so neither may reach
    // the form. Escape with the dropdown already closed still belongs to it.
    const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter") {
            event.stopPropagation();
        } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            close();
        }
    };

    // A portal still bubbles events to its React parent, so keys the popup owns
    // have to be stopped here too.
    const onPopupKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
            triggerRef.current?.focus();
            return;
        }
        // Arrows and Enter drive the search field alone; an option reached by
        // tab is left to the browser's own click-on-Enter.
        if (event.target !== searchRef.current || matches.length === 0) return;

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive(
                (previous) =>
                    (previous + step + matches.length) % matches.length,
            );
        } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            select(matches[active]);
        }
    };

    return (
        <div className={`min-w-0 ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? close() : setOpen(true))}
                onKeyDown={onTriggerKeyDown}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={label}
                className={`${FIELD_CLASS[variant]} flex cursor-pointer items-center justify-between gap-1 text-left ${open ? "border-accent bg-background" : ""}`}
            >
                <span
                    className={`truncate ${placeholder ? "text-sub" : (current?.text ?? "")}`}
                >
                    {placeholder ?? current?.label ?? "Not set"}
                </span>
                <span
                    aria-hidden="true"
                    className={`icon-[lucide--chevron-down] size-3 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            {placed &&
                createPortal(
                    <div
                        ref={popupRef}
                        onKeyDown={onPopupKeyDown}
                        data-open={open || undefined}
                        style={{
                            ...placed.style,
                            maxHeight: placed.maxHeight,
                        }}
                        className="popup fixed z-50 flex-col border border-hairline bg-background shadow-sm"
                    >
                        {searchable && (
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setActive(0);
                                }}
                                placeholder="Search"
                                aria-label={`Search ${label}`}
                                role="combobox"
                                aria-expanded
                                aria-controls={listId}
                                aria-autocomplete="list"
                                aria-activedescendant={
                                    matches.length > 0
                                        ? `${listId}-${active}`
                                        : undefined
                                }
                                className="h-7 w-full shrink-0 border-b border-hairline bg-background px-2 text-xs text-ink placeholder:text-muted focus:outline-none"
                            />
                        )}
                        <ul
                            ref={listRef}
                            id={listId}
                            role="listbox"
                            aria-label={label}
                            className="min-h-0 flex-1 overflow-y-auto"
                        >
                            {matches.map((option, index) => {
                                const selected =
                                    !placeholder && option.value === value;
                                const highlighted =
                                    searchable && index === active;
                                return (
                                    <li
                                        key={option.label}
                                        id={`${listId}-${index}`}
                                        role="option"
                                        aria-selected={selected}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => select(option)}
                                            onMouseMove={() => setActive(index)}
                                            className={`flex w-full cursor-pointer items-center px-2 py-1.5 text-left text-xs transition-colors ${
                                                selected
                                                    ? "bg-accent-tint"
                                                    : highlighted
                                                      ? "bg-surface"
                                                      : "hover:bg-surface"
                                            }`}
                                        >
                                            <span
                                                className={`truncate ${option.text ?? "text-ink"}`}
                                            >
                                                {option.label}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                            {matches.length === 0 && (
                                <li className="px-2 py-1.5 text-xs text-muted">
                                    No matches
                                </li>
                            )}
                        </ul>
                    </div>,
                    document.body,
                )}
        </div>
    );
};

export const STATUS_OPTIONS: Option<ApplicationStatus>[] =
    APPLICATION_STATUSES.map((status) => ({
        value: status,
        label: STATUS_META[status].label,
        text: STATUS_META[status].text,
        keywords: STATUS_KEYWORDS[status],
    }));

export const ARRANGEMENT_OPTIONS: Option<Arrangement | null>[] = [
    { value: null, label: "Not set" },
    ...ARRANGEMENTS.map((arrangement) => ({
        value: arrangement,
        label: arrangementLabel(arrangement),
    })),
];
