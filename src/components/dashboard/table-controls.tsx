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
    MONTHS,
    STATUS_KEYWORDS,
    STATUS_META,
    arrangementLabel,
    formatDay,
    toDateInput,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import { searchScore } from "@/lib/fuzzy";
import { CURRENCIES, currencyCountry, currencyName } from "@/lib/pay";
import { APPLIED_MIN, APPLIED_MIN_YEAR } from "@/lib/validation";

// Bulk mode turns every cell of every row into a field, so borders on all of
// them would be noise; cells read as plain text until hovered or focused. Rows
// carry a fixed height, so swapping cells for fields never changes the shape of
// the table.
// The box is pulled out into the column gap by exactly its own padding, and it
// rings itself with an outline rather than a border, so the text inside a field
// lands on the same pixel as the read-only text it replaces.
export const cellFieldClass =
    "-mx-1 h-6 min-w-0 bg-transparent px-1 text-xs text-ink outline-1 outline-transparent transition-colors placeholder:text-muted hover:outline-hairline focus:bg-background focus:outline-tile-border";

export const formInputClass =
    "w-full border border-hairline bg-background px-2.5 py-1.5 text-xs text-ink transition-colors placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export const checkboxClass =
    "size-3.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// These are fixed h-8 boxes, so a label that wraps spills out of one instead of
// making it taller. They hold their line and their width, and the bars they sit
// in wrap around them.
export const ghostButtonClass =
    "inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap px-3 text-sm text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const primaryButtonClass =
    "inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap bg-accent px-3 text-sm font-medium text-background transition-colors hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent";

export const secondaryButtonClass =
    "focus-frame inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border border-hairline bg-background px-3 text-sm text-ink transition-colors hover:border-tile-border";

export const dangerButtonClass =
    "inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap bg-rose px-3 text-sm font-medium text-background transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40";

export const quietButtonClass =
    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// `keywords` are searched but never shown, so an option can be found by what it
// means as well as by what it is called. `icon` is the source of a small image
// drawn ahead of the label; a list where only some options carry one still
// reserves the space on all of them, so the labels line up either way.
export type Option<T> = {
    value: T;
    label: string;
    text?: string;
    keywords?: readonly string[];
    icon?: string;
};

// "cell" sits on the table grid and stays invisible until touched, "form"
// matches the bordered inputs of the add row and the detail panel.
const FIELD_CLASS = {
    cell: cellFieldClass,
    form: formInputClass,
};

const FIELD_OPEN_CLASS = {
    cell: "bg-background outline-accent",
    form: "border-accent bg-background",
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
// otherwise clip the popup on the last rows. A popup that grows with its
// contents leaves `size` out and takes the height it is given back; one of a
// fixed size passes its own and uses only the side it was put on.
const placeFrom = (
    rect: DOMRect,
    size?: { width: number; height: number },
): { style: Placement; maxHeight: number } => {
    const width = size?.width ?? Math.max(rect.width, POPUP_MIN_WIDTH);
    const wanted = size?.height ?? POPUP_MAX;
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const left = Math.min(rect.left, window.innerWidth - width - EDGE);

    if (below < Math.min(wanted, above)) {
        return {
            style: { left, width, bottom: window.innerHeight - rect.top + GAP },
            maxHeight: Math.min(wanted, above),
        };
    }
    return {
        style: { left, width, top: rect.bottom + GAP },
        maxHeight: Math.min(wanted, below),
    };
};

// Decoration beside a label, and the empty slot an option without one keeps so
// that the labels stay in a column. A plain <img> rather than next/image: these
// are a few hundred bytes of SVG each, nothing to optimise, and `lazy` is what
// keeps a list of two hundred of them to the handful actually on screen.
const OptionIcon = ({ src }: { src?: string }) =>
    src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-4 shrink-0" />
    ) : (
        <span aria-hidden="true" className="size-4 shrink-0" />
    );

// An open modal dialog makes the rest of the document inert, so a popup sent to
// the body would render but refuse every click. Inside one, it belongs to the
// dialog.
const popupHost = (trigger: HTMLElement | null): HTMLElement =>
    trigger?.closest("dialog") ?? document.body;

// `position: fixed` measures from the viewport only while nothing above it
// carries a transform, scale or translate. Anything that does becomes the
// containing block instead, and the coordinates worked out above land the popup
// that far out. Centred dialogs animate on `scale` and so do exactly this, while
// the drawer rests at `transform: none` and does not (see globals.css), so which
// it is has to be read off the element rather than assumed.
const shiftsOrigin = (host: HTMLElement): boolean => {
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

// Re-reads a viewport placement against whichever ancestor is actually acting as
// the origin, leaving it alone when that is the viewport after all.
const within = (style: Placement, host: HTMLElement): Placement => {
    if (!shiftsOrigin(host)) return style;
    const origin = host.getBoundingClientRect();
    const left = style.left - origin.left;
    return style.top === undefined
        ? {
              left,
              width: style.width,
              bottom: origin.bottom - window.innerHeight + style.bottom,
          }
        : { left, width: style.width, top: style.top - origin.top };
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
    disabled = false,
}: {
    value: T | null;
    options: Option<T>[];
    onChange: (value: T) => void;
    label: string;
    placeholder?: string;
    className?: string;
    variant?: FieldVariant;
    searchable?: boolean;
    disabled?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [placed, setPlaced] = useState<
        (ReturnType<typeof placeFrom> & { host: HTMLElement }) | null
    >(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();
    const current = options.find((option) => option.value === value);
    // One list either draws glyphs or it does not, so the slot is reserved on
    // every row of a list that has any. Options without one keep their label in
    // line with the rest rather than sliding under the glyphs.
    const iconic = options.some((option) => option.icon);

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
        if (!trigger) return;
        const host = popupHost(trigger);
        const placement = placeFrom(trigger.getBoundingClientRect());
        setPlaced({
            ...placement,
            style: within(placement.style, host),
            host,
        });
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
            // Escape belongs to the dropdown while it is open. Closing a modal
            // dialog is the browser's own default action for the same press, so
            // without this one press would shut the panel behind it too.
            event.preventDefault();
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
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    };

    // A portal still bubbles events to its React parent, so keys the popup owns
    // have to be stopped here too.
    const onPopupKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
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
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={label}
                className={`${FIELD_CLASS[variant]} flex cursor-pointer items-center justify-between gap-1 text-left ${open ? FIELD_OPEN_CLASS[variant] : ""}`}
            >
                <span className="flex min-w-0 items-center gap-2">
                    {iconic && (
                        <OptionIcon
                            src={placeholder ? undefined : current?.icon}
                        />
                    )}
                    <span
                        className={`truncate ${placeholder ? "text-sub" : (current?.text ?? "")}`}
                    >
                        {placeholder ?? current?.label ?? "Not set"}
                    </span>
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
                                            className={`flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors ${
                                                selected
                                                    ? "bg-accent-tint"
                                                    : highlighted
                                                      ? "bg-surface"
                                                      : "hover:bg-surface"
                                            }`}
                                        >
                                            {iconic && (
                                                <OptionIcon src={option.icon} />
                                            )}
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
                    placed.host,
                )}
        </div>
    );
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Seven 32px cells and six weeks of them, plus the padding, the month bar and
// the row of weekday letters.
const CALENDAR_WIDTH = 250;
const CALENDAR_HEIGHT = 288;

// Dates are held as plain yyyy-mm-dd and read from their parts: `new Date(value)`
// would take them as UTC midnight and land on the day before west of it.
const parseDay = (value: string): Date | null => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const shiftDay = (date: Date, days: number) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// The field records a day that has already happened, so the calendar offers
// nothing past today and nothing before the floor the server enforces, and the
// keyboard cursor is held inside the same window: focus does not land on a
// disabled button, it goes nowhere at all.
const APPLIED_FLOOR = new Date(APPLIED_MIN_YEAR, 0, 1);

const clampDay = (date: Date, latest: Date): Date =>
    date > latest ? latest : date < APPLIED_FLOOR ? APPLIED_FLOOR : date;

const shiftMonth = (date: Date, months: number) =>
    new Date(date.getFullYear(), date.getMonth() + months, 1);

const shiftYear = (date: Date, years: number) =>
    new Date(date.getFullYear() + years, date.getMonth(), 1);

// Whether a yyyy-mm-dd falls in the given year and zero-based month.
const inMonth = (date: string, year: number, month: number) =>
    date.startsWith(`${year}-`) && Number(date.slice(5, 7)) === month + 1;

const sameMonth = (first: Date, second: Date) =>
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth();

// Always six weeks from the Sunday on or before the 1st, so paging through the
// months never changes the height of the popup and the days either side of the
// month stay in reach.
const monthGrid = (view: Date): Date[] => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = shiftDay(first, -first.getDay());
    return Array.from({ length: 42 }, (_, index) => shiftDay(start, index));
};

// A row is seven days wide in the day grid and three months wide in the month
// one, so the vertical arrows step by that much.
const ARROW_STEP = {
    days: { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 },
    months: { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 },
} satisfies Record<string, Record<string, number>>;

type CalendarMode = keyof typeof ARROW_STEP;

const pagerClass =
    "flex size-7 cursor-pointer items-center justify-center text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted";

// A custom calendar rather than <input type="date">: the native field draws a
// picker the page has no say over, in a typeface and a set of corners that are
// not this one's. Clicking the day already held clears the field, which is the
// same second press that backs out of any other choice here.
export const DateField = ({
    value,
    onChange,
    label,
    className = "",
    variant = "cell",
    disabled = false,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    className?: string;
    variant?: FieldVariant;
    disabled?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const [placed, setPlaced] = useState<
        (ReturnType<typeof placeFrom> & { host: HTMLElement }) | null
    >(null);
    // The day the keyboard is on, and the month the grid draws around it.
    const [cursor, setCursor] = useState(() => parseDay(value) ?? new Date());
    const [mode, setMode] = useState<CalendarMode>("days");
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const cursorRef = useRef<HTMLButtonElement>(null);

    const now = new Date();
    const todayDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    );
    const today = toDateInput(todayDate);
    const cursorKey = toDateInput(cursor);
    const days = mode === "days";
    const atLatest = days
        ? sameMonth(cursor, todayDate)
        : cursor.getFullYear() === todayDate.getFullYear();
    const atFloor = days
        ? sameMonth(cursor, APPLIED_FLOOR)
        : cursor.getFullYear() === APPLIED_MIN_YEAR;

    const place = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const host = popupHost(trigger);
        const placement = placeFrom(trigger.getBoundingClientRect(), {
            width: CALENDAR_WIDTH,
            height: CALENDAR_HEIGHT,
        });
        setPlaced({
            ...placement,
            style: within(placement.style, host),
            host,
        });
    }, []);

    const close = useCallback(() => setOpen(false), []);

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
            // Escape belongs to the calendar while it is open, and closing the
            // dialog behind it is the browser's default for the same press.
            event.preventDefault();
            close();
            triggerRef.current?.focus();
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [open, place, close]);

    // Focus follows the cursor, so the arrows move it and the grid holds a
    // single tab stop rather than forty two. The popup is placed in view
    // already, and letting the focus scroll to it would shift the page under it.
    useEffect(() => {
        if (open && placed) cursorRef.current?.focus({ preventScroll: true });
    }, [open, placed, mode, cursorKey]);

    const select = (date: Date) => {
        const picked = toDateInput(date);
        onChange(picked === value ? "" : picked);
        close();
        triggerRef.current?.focus();
    };

    const moveCursor = (step: (current: Date) => Date) =>
        setCursor((current) => clampDay(step(current), todayDate));

    const openAt = () => {
        setCursor(clampDay(parseDay(value) ?? todayDate, todayDate));
        setMode("days");
        setOpen(true);
    };

    // The header steps by whatever the grid below it is showing, so the same
    // pair of arrows walks months in one mode and years in the other.
    const stepPage = (direction: number) =>
        moveCursor((current) =>
            mode === "days"
                ? shiftMonth(current, direction)
                : shiftYear(current, direction),
        );

    // The row editor and the add panel read Enter as save and Escape as cancel,
    // so neither may reach them from a control that owns both.
    const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter") {
            event.stopPropagation();
        } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    };

    // A portal bubbles to its React parent, so the keys the calendar owns are
    // stopped here as well.
    const onPopupKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
            triggerRef.current?.focus();
            return;
        }
        if (event.key === "Enter") {
            event.stopPropagation();
            return;
        }
        const step = (ARROW_STEP[mode] as Record<string, number>)[event.key];
        if (step === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        moveCursor((current) =>
            mode === "days"
                ? shiftDay(current, step)
                : shiftMonth(current, step),
        );
    };

    return (
        <div className={`min-w-0 ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? close() : openAt())}
                onKeyDown={onTriggerKeyDown}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={label}
                className={`${FIELD_CLASS[variant]} group flex cursor-pointer items-center justify-between gap-1 text-left ${open ? FIELD_OPEN_CLASS[variant] : ""}`}
            >
                <span className={`truncate ${value ? "" : "text-muted"}`}>
                    {value ? formatDay(value) : "Not set"}
                </span>
                {/* Repeated down every row of a bulk edit the glyph is the
                    noisiest thing on the table, so in a cell it shows on the
                    one being worked on. */}
                <span
                    aria-hidden="true"
                    className={`icon-[lucide--calendar] size-3 shrink-0 text-muted transition-opacity ${
                        variant === "cell" && !open
                            ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                            : ""
                    }`}
                />
            </button>
            {placed &&
                createPortal(
                    <div
                        ref={popupRef}
                        onKeyDown={onPopupKeyDown}
                        data-open={open || undefined}
                        role="dialog"
                        aria-label={label}
                        style={placed.style}
                        className="popup fixed z-50 flex-col gap-2 border border-hairline bg-background p-3 shadow-sm"
                    >
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => stepPage(-1)}
                                disabled={atFloor}
                                aria-label={
                                    days ? "Previous month" : "Previous year"
                                }
                                className={pagerClass}
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--chevron-left] size-3.5"
                                />
                            </button>
                            {/* The title is the way back out: it opens the
                                months, and picking one or pressing it again
                                returns to the days of that month. */}
                            <button
                                type="button"
                                onClick={() =>
                                    setMode(days ? "months" : "days")
                                }
                                aria-expanded={!days}
                                className="cursor-pointer px-2 text-sm font-medium text-ink transition-colors hover:text-accent focus-visible:outline-1 focus-visible:outline-accent"
                            >
                                {days && `${MONTHS[cursor.getMonth()]} `}
                                {cursor.getFullYear()}
                            </button>
                            <button
                                type="button"
                                onClick={() => stepPage(1)}
                                disabled={atLatest}
                                aria-label={days ? "Next month" : "Next year"}
                                className={pagerClass}
                            >
                                <span
                                    aria-hidden="true"
                                    className="icon-[lucide--chevron-right] size-3.5"
                                />
                            </button>
                        </div>
                        {days && (
                            <div
                                aria-hidden="true"
                                className="grid grid-cols-7 border-b border-hairline pb-2"
                            >
                                {WEEKDAYS.map((letter, index) => (
                                    <span
                                        key={`${letter}${index}`}
                                        className="text-center text-xs font-medium text-muted"
                                    >
                                        {letter}
                                    </span>
                                ))}
                            </div>
                        )}
                        {!days && (
                            <div className="grid grid-cols-3">
                                {MONTHS.map((month, index) => {
                                    const year = cursor.getFullYear();
                                    const held = inMonth(value, year, index);
                                    const ahead =
                                        new Date(year, index, 1) > todayDate;
                                    const monthClass = ahead
                                        ? "text-muted opacity-40"
                                        : held
                                          ? "bg-accent font-medium text-background"
                                          : inMonth(today, year, index)
                                            ? "bg-accent-tint font-medium text-ink"
                                            : "text-ink hover:bg-surface";
                                    return (
                                        <button
                                            key={month}
                                            ref={
                                                index === cursor.getMonth()
                                                    ? cursorRef
                                                    : undefined
                                            }
                                            type="button"
                                            tabIndex={
                                                index === cursor.getMonth()
                                                    ? 0
                                                    : -1
                                            }
                                            onClick={() => {
                                                moveCursor(
                                                    () =>
                                                        new Date(
                                                            year,
                                                            index,
                                                            1,
                                                        ),
                                                );
                                                setMode("days");
                                            }}
                                            disabled={ahead}
                                            aria-pressed={held}
                                            className={`h-14 cursor-pointer text-xs transition-colors focus-visible:outline-1 focus-visible:outline-accent disabled:cursor-not-allowed ${monthClass}`}
                                        >
                                            {month}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {days && (
                            <div className="grid grid-cols-7">
                                {monthGrid(cursor).map((date) => {
                                    const key = toDateInput(date);
                                    const outside = !sameMonth(date, cursor);
                                    const blocked =
                                        key > today || key < APPLIED_MIN;
                                    // The accent is lighter than the text around
                                    // it, so today is a tinted plate rather than a
                                    // tinted number, which would read as disabled.
                                    const dayClass = blocked
                                        ? "text-muted opacity-40"
                                        : key === value
                                          ? "bg-accent font-medium text-background"
                                          : key === today
                                            ? "bg-accent-tint font-medium text-ink"
                                            : `hover:bg-surface ${outside ? "text-muted" : "text-ink"}`;
                                    return (
                                        <button
                                            key={key}
                                            ref={
                                                key === cursorKey
                                                    ? cursorRef
                                                    : undefined
                                            }
                                            type="button"
                                            tabIndex={
                                                key === cursorKey ? 0 : -1
                                            }
                                            onClick={() => select(date)}
                                            disabled={blocked}
                                            aria-pressed={key === value}
                                            aria-label={formatDay(key)}
                                            className={`h-8 cursor-pointer text-xs tabular-nums transition-colors focus-visible:outline-1 focus-visible:outline-accent disabled:cursor-not-allowed ${dayClass}`}
                                        >
                                            {date.getDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>,
                    placed.host,
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

// Codes are what people recognise, so the currency's name is searchable rather
// than shown, and the flag carries the recognition instead. The flags are files
// under public/, written by `bun run flags:sync`, so a page that never opens
// this list downloads none of them and one that does takes only the few it
// draws.
export const CURRENCY_OPTIONS: Option<string>[] = CURRENCIES.map((code) => {
    const country = currencyCountry(code);
    return {
        value: code,
        label: code,
        keywords: [currencyName.of(code) ?? code],
        icon: country ? `/flags/${country}.svg` : undefined,
    };
});

export const ARRANGEMENT_OPTIONS: Option<Arrangement | null>[] = [
    { value: null, label: "Not set" },
    ...ARRANGEMENTS.map((arrangement) => ({
        value: arrangement,
        label: arrangementLabel(arrangement),
    })),
];
