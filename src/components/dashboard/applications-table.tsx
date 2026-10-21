"use client";

import {
    memo,
    useEffect,
    useMemo,
    useOptimistic,
    useRef,
    useState,
    useTransition,
    type PointerEvent as ReactPointerEvent,
} from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/validation";
import {
    loadApplicationExtras,
    permanentlyRemoveApplication,
    removeApplication,
    removeApplications,
    setApplicationsArrangement,
    setApplicationsRanking,
    setApplicationsStatus,
    updateApplicationsBulk,
    type ApplicationDraft,
} from "@/app/dashboard/actions";
import { LocalDateTime } from "@/components/dashboard/local-date-time";
import {
    ApplicationsHeaderRow,
    ROW_HEIGHT,
    ROW_REM,
    applicationGrid,
} from "@/components/dashboard/applications-columns";
import { useRowWindow } from "@/components/dashboard/use-row-window";
import { useTooltip } from "@/components/dashboard/tooltip";
import { useDragSelect } from "@/components/dashboard/use-drag-select";
import { ApplicationsFilterMenu } from "@/components/dashboard/applications-filter";
import type { ExportFormat } from "@/components/dashboard/applications-export";
import {
    DownloadMenu,
    type DownloadFormat,
} from "@/components/dashboard/download-menu";
import {
    NO_FILTERS,
    applicationsView,
    isFiltered,
    nextSort,
    payInCurrency,
    type Filters,
    type Sort,
} from "@/components/dashboard/applications-view";
import {
    CellSelect,
    CURRENCY_OPTIONS,
    DateField,
    STATUS_OPTIONS,
    ARRANGEMENT_OPTIONS,
    RANKING_OPTIONS,
    SearchField,
    cellFieldClass,
    checkboxClass,
    dangerButtonClass,
    type Option,
    ghostButtonClass,
    primaryButtonClass,
    quietButtonClass,
    secondaryButtonClass,
} from "@/components/dashboard/table-controls";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { CURRENCY_MARK_CLASS } from "@/components/dashboard/currency-flag";
import { useViewing } from "@/components/dashboard/viewing";
import {
    DeferredDialogLoading,
    DeferredDrawerLoading,
} from "@/components/dashboard/deferred-overlay-loading";
import {
    OverlayDialog,
    OverlayDrawer,
} from "@/components/dashboard/overlay-shell";
import {
    STATUS_META,
    arrangementLabel,
    browserTimeZone,
    formatDay,
    rankingLabel,
    todayDateInput,
    type ApplicationExtras,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
    type Ranking,
} from "@/components/dashboard/data";
import { fileSlug, saveBlob } from "@/lib/download";
import type { ExchangeRates } from "@/lib/exchange";
import {
    COMPANY_MAX,
    LOCATION_MAX,
    PAY_MAX,
    ROLE_MAX,
} from "@/lib/constraints";

const AddApplicationForm = dynamic(
    () =>
        import("@/components/dashboard/add-application-form").then(
            (module) => module.AddApplicationForm,
        ),
    {
        loading: () => (
            <DeferredDrawerLoading
                title="New application"
                subtitle="Start with the posting link."
                label="Opening application form..."
            />
        ),
    },
);

const ApplicationPanel = dynamic(
    () =>
        import("@/components/dashboard/application-panel").then(
            (module) => module.ApplicationPanel,
        ),
    {
        loading: () => (
            <DeferredDrawerLoading
                title="Application"
                label="Opening application..."
            />
        ),
    },
);

const ImportDialog = dynamic(
    () =>
        import("@/components/dashboard/import-dialog").then(
            (module) => module.ImportDialog,
        ),
    {
        loading: () => (
            <DeferredDialogLoading
                title="Import applications"
                label="Opening importer..."
            />
        ),
    },
);

type Draft = {
    company: string;
    role: string;
    status: ApplicationStatus;
    ranking: Ranking | null;
    location: string;
    arrangement: Arrangement | null;
    pay: string;
    appliedAt: string;
    url: string;
};

const draftOf = (app: ApplicationRow): Draft => ({
    company: app.company,
    role: app.role ?? "",
    status: app.status,
    ranking: app.ranking,
    location: app.location ?? "",
    arrangement: app.arrangement,
    pay: app.payNote ?? app.pay ?? "",
    appliedAt: app.appliedAt ?? "",
    url: app.url ?? "",
});

const asDraftInput = (draft: Draft): ApplicationDraft => ({
    company: draft.company,
    role: draft.role,
    status: draft.status,
    ranking: draft.ranking,
    location: draft.location,
    arrangement: draft.arrangement,
    pay: draft.pay,
    appliedAt: draft.appliedAt,
    url: draft.url,
});

const sameDraft = (a: Draft, b: Draft): boolean =>
    (Object.keys(a) as (keyof Draft)[]).every((key) => a[key] === b[key]);

// Every cell that can overflow carries its own value as a tooltip, so a clipped
// company or role is still readable without opening the editor.
const Cell = ({
    value,
    title,
    className = "text-sub",
}: {
    value: string | null;
    // What hovering says, when that is not simply the whole of a truncated
    // cell: a converted figure hangs the amount on record here instead.
    title?: string | null;
    className?: string;
}) => (
    <span
        className={`truncate ${className}`}
        title={title ?? value ?? undefined}
    >
        {value}
    </span>
);

// The quick-editable fields of one row, laid out on the shared grid so bulk
// edit mode stays aligned with the read-only rows. Everything an application
// holds beyond these is edited in the detail panel.
const RowFields = ({
    draft,
    rankings,
    onChange,
}: {
    draft: Draft;
    rankings: boolean;
    onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) => (
    <>
        <input
            value={draft.company}
            onChange={(event) => onChange("company", event.target.value)}
            placeholder="Company"
            aria-label="Company"
            maxLength={COMPANY_MAX}
            className={cellFieldClass}
        />
        <input
            value={draft.role}
            onChange={(event) => onChange("role", event.target.value)}
            placeholder="Role"
            aria-label="Role"
            maxLength={ROLE_MAX}
            className={cellFieldClass}
        />
        {/* Status reads as a plate, whose own padding holds the label 8px in.
                The field carries the same inset so the label stays put when the
                row switches into edit mode. */}
        <CellSelect
            label="Status"
            value={draft.status}
            options={STATUS_OPTIONS}
            onChange={(status) => onChange("status", status)}
            className="pl-2"
            searchable
        />
        {rankings && (
            <CellSelect
                label="Ranking"
                value={draft.ranking}
                options={RANKING_OPTIONS}
                onChange={(ranking) => onChange("ranking", ranking)}
            />
        )}
        <input
            value={draft.location}
            onChange={(event) => onChange("location", event.target.value)}
            placeholder="Location"
            aria-label="Location"
            maxLength={LOCATION_MAX}
            className={cellFieldClass}
        />
        <CellSelect
            label="Arrangement"
            value={draft.arrangement}
            options={ARRANGEMENT_OPTIONS}
            onChange={(arrangement) => onChange("arrangement", arrangement)}
        />
        <input
            value={draft.pay}
            onChange={(event) => onChange("pay", event.target.value)}
            placeholder="120k-140k/yr"
            aria-label="Pay"
            maxLength={PAY_MAX}
            className={cellFieldClass}
        />
        <DateField
            label="Applied date"
            value={draft.appliedAt}
            onChange={(appliedAt) => onChange("appliedAt", appliedAt)}
        />
    </>
);

// Three 2rem squares fill the actions column exactly, and each spans the row's
// full height, so the glyphs sit apart rather than in a huddle and there is a
// real target to press on a phone rather than the icon's own 14px.
const ACTION_CLASS =
    "flex h-full w-8 items-center justify-center transition-[color,opacity] hover:text-ink";

// A touch screen has no pointer to rest on a row, and Tailwind's hover variant
// stands down there, so a glyph that waits for hover is one that never appears.
const REVEAL_CLASS =
    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

// Where the gestures are made known. Somebody about to select rows is already
// looking at this column, and the box at the head of it is the one thing in it
// that answers a pointer, so what it can do rides along with what it says.
// The bar below repeats the short of it once a row is held, which is the other
// moment a reader is about to want a second one.
const SelectAllBox = ({
    showing,
    all,
    some,
    onChange,
}: {
    showing: number;
    all: boolean;
    // Some but not all, which a tick box can only say through a property. It is
    // set here rather than by the table, so nothing outside has to hold a
    // reference to this box to say it.
    some: boolean;
    onChange: () => void;
}) => {
    const { triggerProps, tooltip, tooltipId, open } =
        useTooltip<HTMLSpanElement>(
            <>
                Select all {showing} showing.
                <br />
                Drag the tick column to select a run, Alt-drag to remove,
                Shift-click to extend.
            </>,
        );
    const box = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (box.current) box.current.indeterminate = some;
    }, [some]);

    return (
        <>
            {/* The hint hangs on the cell rather than the box, so it is raised
                by a pointer anywhere in a column the box itself fills a
                quarter of. Focus carries up to here too, so reaching the box
                by keyboard reads the same hint. */}
            <span {...triggerProps} className="flex items-center">
                <input
                    ref={box}
                    type="checkbox"
                    checked={all}
                    onChange={onChange}
                    autoComplete="off"
                    // A filter is often the fastest way to a selection, so this
                    // box says how many it would take rather than leaving the
                    // reader to go by the count in the heading.
                    aria-label={`Select all ${showing} applications showing`}
                    aria-describedby={open ? tooltipId : undefined}
                    className={checkboxClass}
                />
            </span>
            {tooltip}
        </>
    );
};

// What a row can ask the table to do. One object for the life of the table, so
// a row that has not changed is not redrawn by the row beside it: ticking one
// box has no business running the other thirty-seven rows through React again.
// Everything here takes the row it is about, since nothing in it may be built
// per row without giving that up. See rowActions.
type RowActions = {
    select: (index: number, selected: boolean, extend: boolean) => void;
    press: (event: ReactPointerEvent, index: number) => void;
    edit: (id: string) => void;
    prefetch: (id: string) => void;
    remove: (id: string) => void;
};

const Row = ({
    app,
    index,
    columns,
    rankings,
    convertedPay,
    selected,
    opening,
    viewing,
    actions,
}: {
    app: ApplicationRow;
    // Where the row stands in the table as it is showing, which is what a
    // range of rows is counted in.
    index: number;
    columns: string;
    rankings: boolean;
    convertedPay: string | null;
    selected: boolean;
    opening: boolean;
    // A tick is only ever the start of a bulk edit or a delete, so the box goes
    // with them while an admin is viewing this account. The drawer stays, since
    // notes and the status trail are not on the row, and opens flat.
    viewing: boolean;
    actions: RowActions;
}) => {
    const meta = STATUS_META[app.status];
    return (
        <li
            className={`${columns} ${ROW_HEIGHT} group border-b border-faint px-5 text-xs transition-colors last:border-b-0 ${selected ? "bg-accent-tint-soft" : "hover:bg-surface"}`}
        >
            {viewing ? (
                <span />
            ) : (
                // The box is 14px across, which is a fair target for a press
                // and a poor one for the start of a drag, so the whole gutter
                // cell takes the press.
                //
                // `touch-none` is what lets a finger dragged from here select
                // rows rather than scroll the table, and it is asked for only
                // where there is a finger. `touch-action` governs touch alone,
                // so on a mouse it buys nothing, and it is not free: Firefox
                // cannot hit-test an element with a non-default
                // `touch-action` on the compositor and has to ask the main
                // thread about it instead. One on every drawn row put much of
                // the table on that slow path, and input through it dragged.
                // Chrome does not do this, which is why it only ever showed up
                // in Firefox, and no measurement here caught it because a
                // scripted `click()` skips hit-testing altogether.
                <span
                    onPointerDown={(event) => actions.press(event, index)}
                    onMouseDown={(event) => {
                        // A shift-press extends the window's text selection
                        // from wherever the last press left the caret, which
                        // paints the table blue. Cancelling it is the only way
                        // to stop that, and cancelling also cancels the focus
                        // the press would have given the box, so that is put
                        // back by hand.
                        //
                        // An ordinary press is left alone. Cancelling every
                        // press, and reaching into the cell to focus the box
                        // again afterwards, was work charged to a gesture that
                        // never needed it: a drag holds text selection off the
                        // document for its duration instead. See useDragSelect.
                        if (!event.shiftKey) return;
                        event.preventDefault();
                        event.currentTarget
                            .querySelector("input")
                            ?.focus({ preventScroll: true });
                    }}
                    className="flex select-none items-center self-stretch pointer-coarse:touch-none"
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        // Handled on the click rather than the change, which is
                        // the event that carries the shift. A tick box raises
                        // one from the keyboard too, with the shift reading
                        // false, so the space bar keeps working.
                        readOnly
                        onClick={(event) =>
                            actions.select(
                                index,
                                event.currentTarget.checked,
                                event.shiftKey,
                            )
                        }
                        // Firefox restores tick marks across a reload, which would
                        // outlive the selection state that drives the rest of the UI.
                        autoComplete="off"
                        aria-label={`Select ${app.company}`}
                        className={checkboxClass}
                    />
                </span>
            )}
            <Cell value={app.company} className="font-medium text-ink" />
            <Cell value={app.role} />
            <span className="min-w-0">
                <span
                    className={`inline-flex max-w-full items-center truncate px-2 py-0.5 font-medium ${meta.plate}`}
                    title={meta.label}
                >
                    {meta.label}
                </span>
            </span>
            {rankings && (
                <Cell value={app.ranking ? rankingLabel(app.ranking) : null} />
            )}
            <Cell value={app.location} />
            <Cell
                value={
                    app.arrangement ? arrangementLabel(app.arrangement) : null
                }
            />
            <Cell
                value={convertedPay ?? app.pay}
                title={
                    convertedPay &&
                    app.pay &&
                    `${convertedPay}, from ${app.pay}`
                }
                className="text-sub tabular-nums"
            />
            <Cell
                value={app.appliedAt ? formatDay(app.appliedAt) : null}
                className="text-sub tabular-nums"
            />
            <LocalDateTime
                dateTime={app.updatedAt}
                className="truncate text-muted tabular-nums"
            >
                {app.updated}
            </LocalDateTime>
            <span className="flex items-center justify-end self-stretch text-muted">
                {app.url && (
                    <a
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open posting"
                        aria-label="Open posting"
                        className={ACTION_CLASS}
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--link] block size-3.5"
                        />
                    </a>
                )}
                {/* This glyph only appears once the pointer is on the row, so
                    reaching it is already a deliberate move, and the trip from
                    here to the press is usually long enough to cover the read
                    behind it. When it is not, the glyph spins and holds the
                    press. It keeps its box either way. */}
                <button
                    type="button"
                    onClick={() => actions.edit(app.id)}
                    onMouseEnter={() => actions.prefetch(app.id)}
                    onFocus={() => actions.prefetch(app.id)}
                    disabled={opening}
                    title={viewing ? "Open application" : "Edit application"}
                    aria-label={
                        viewing ? "Open application" : "Edit application"
                    }
                    className={`${ACTION_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        opening
                            ? "cursor-wait opacity-100"
                            : `${REVEAL_CLASS} cursor-pointer`
                    }`}
                >
                    <span
                        aria-hidden="true"
                        className={`block size-3.5 ${opening ? "icon-[lucide--loader-circle] animate-spin" : viewing ? "icon-[lucide--eye]" : "icon-[lucide--pencil]"}`}
                    />
                </button>
                {viewing ? null : (
                    <button
                        type="button"
                        onClick={() => actions.remove(app.id)}
                        title="Delete application"
                        aria-label="Delete application"
                        className={`${ACTION_CLASS} ${REVEAL_CLASS} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--trash-2] block size-3.5"
                        />
                    </button>
                )}
            </span>
        </li>
    );
};

// A selection redraws the table, and every row drawn but the one or two it
// touched is unchanged by it. Comparing the props of a row costs far less than
// building it again, which is why nothing a row is handed may be made fresh
// per render: see RowActions.
const ReadRow = memo(Row);

const BulkRow = ({
    draft,
    columns,
    rankings,
    updated,
    updatedAt,
    onChange,
}: {
    draft: Draft;
    columns: string;
    rankings: boolean;
    updated: string;
    updatedAt: string;
    onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) => (
    <li
        className={`${columns} ${ROW_HEIGHT} border-b border-faint px-5 text-xs last:border-b-0`}
    >
        <span />
        <RowFields draft={draft} rankings={rankings} onChange={onChange} />
        {/* Nothing here is editable, but the column keeps its reading so the
                row does not trail off into empty space. */}
        <LocalDateTime
            dateTime={updatedAt}
            className="truncate text-muted tabular-nums"
        >
            {updated}
        </LocalDateTime>
    </li>
);

const DeleteRow = ({
    label,
    minWidth,
    onConfirm,
    onPermanent,
    onCancel,
}: {
    label: string;
    minWidth: string;
    onConfirm: () => void;
    onPermanent: () => void;
    onCancel: () => void;
}) => (
    <li
        className={`${ROW_HEIGHT} ${minWidth} flex items-center gap-4 border-b border-faint bg-surface px-5 last:border-b-0`}
    >
        <p className="min-w-0 flex-1 truncate text-xs text-ink">
            Delete {label}? You can undo this from History.
        </p>
        <div className="flex shrink-0 items-center gap-1">
            <button
                type="button"
                onClick={onPermanent}
                className="inline-flex h-8 cursor-pointer items-center px-2.5 text-xs font-medium text-rose transition-[background-color,scale] duration-150 ease-out hover:bg-rose-tint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
            >
                Delete permanently
            </button>
            <button
                type="button"
                onClick={onCancel}
                className={ghostButtonClass}
            >
                Cancel
            </button>
            <button
                type="button"
                onClick={onConfirm}
                className={dangerButtonClass}
            >
                Delete
            </button>
        </div>
    </li>
);

// Narrows the table by any word in a row, which is the one control here that
// answers a question about a whole list rather than about one column. Escape
// empties it, so the way back to every row never involves the keyboard's
// backspace.
// The rule only reads as a separator while the bar is one line; once it wraps,
// the groups are already apart and it lands mid-row as a stray mark.
const Divider = () => (
    <span
        aria-hidden="true"
        className="hidden h-4 w-px shrink-0 bg-hairline lg:block"
    />
);

// Once the actions wrap to a line of their own they are the only thing on it,
// so they share it out rather than huddling against the left edge.
const FILL_NARROW = "max-sm:grow max-sm:justify-center";

const countLabel = (count: number) =>
    `${count} application${count === 1 ? "" : "s"}`;

// "Not set" is itself a value a bulk edit can write, so backing out of a staged
// field needs an option of its own. It lives in the menu rather than beside it
// so that what it resets is never in question.
const UNCHANGED = "unchanged";

const STAGED_STATUS_OPTIONS: Option<ApplicationStatus | typeof UNCHANGED>[] = [
    { value: UNCHANGED, label: "Leave unchanged" },
    ...STATUS_OPTIONS,
];

const STAGED_ARRANGEMENT_OPTIONS: Option<
    Arrangement | null | typeof UNCHANGED
>[] = [{ value: UNCHANGED, label: "Leave unchanged" }, ...ARRANGEMENT_OPTIONS];

const STAGED_RANKING_OPTIONS: Option<Ranking | null | typeof UNCHANGED>[] = [
    { value: UNCHANGED, label: "Leave unchanged" },
    ...RANKING_OPTIONS,
];

// The way back out of reading the column in one currency. Leaving it is a
// choice like the currencies are and so is an option among them rather than a
// second control beside the picker, and it carries a mark of its own so the
// labels start on the same pixel as every flag below it.
const ORIGINAL_PAY: Option<string | null> = {
    value: null,
    label: "Original",
    keywords: ["none", "off", "as recorded", "unconverted"],
    icon: (
        <span
            aria-hidden="true"
            className={`icon-[lucide--circle-dashed] ${CURRENCY_MARK_CLASS}`}
        />
    ),
};

const EXPORT_FORMATS: readonly DownloadFormat<ExportFormat>[] = [
    { id: "csv", label: "CSV", icon: "icon-[lucide--file-text]" },
    { id: "xlsx", label: "XLSX", icon: "icon-[lucide--sheet]" },
    { id: "json", label: "JSON", icon: "icon-[lucide--braces]" },
];

export const ApplicationsTable = ({
    listId,
    name,
    applications,
    defaultCurrency,
    cleanLinks,
    employerLinks,
    tidyTitles,
    rankings,
    rates,
}: {
    listId: string;
    name: string;
    applications: ApplicationRow[];
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    tidyTitles: boolean;
    // Whether the account tracks WaterlooWorks rankings, which adds a column.
    rankings: boolean;
    rates: ExchangeRates;
}) => {
    const [, startMutation] = useTransition();
    const grid = applicationGrid(rankings);
    const viewing = useViewing();
    // The panel opens on more than the table carries, so the row it is opened
    // over travels with the notes and status trail fetched for it. Both arrive
    // together, which is what lets the panel draw complete rather than fill in.
    const [editing, setEditing] = useState<{
        id: string;
        extras: ApplicationExtras;
    } | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [permanentDelete, setPermanentDelete] = useState<{
        id: string;
        label: string;
    } | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Map<string, Draft> | null>(null);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkSaving, setBulkSaving] = useState(false);
    // A bulk edit rewrites rows that are mostly scrolled out of view, so a menu
    // pick only stages a value here and the Apply button is what writes it.
    const [stagedStatus, setStagedStatus] = useState<ApplicationStatus | null>(
        null,
    );
    // Wrapped because null is itself a staged value, meaning "clear it".
    const [stagedArrangement, setStagedArrangement] = useState<{
        value: Arrangement | null;
    } | null>(null);
    const [stagedRanking, setStagedRanking] = useState<{
        value: Ranking | null;
    } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    // Which rows are shown and in what order. Held here rather than in the URL:
    // it is how one person is reading the table right now, not where they are.
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [sort, setSort] = useState<Sort | null>(null);
    // Null to begin with: a row reads in the money it was offered in until
    // somebody asks for a currency to read the whole column in.
    const [convertTo, setConvertTo] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    // The row a range is measured from: the last one ticked by hand, or the one
    // a drag came to rest on. Null until something has been ticked, so the
    // first shift-click is read as an ordinary one rather than as a range from
    // the top of a table the reader never looked at.
    //
    // Held as the row rather than as its place in the table. Sorting a column,
    // or a filter that drops a row above it, renumbers everything below, and an
    // anchor kept as a number would quietly come to mean a different row than
    // the one that was ticked.
    const anchor = useRef<string | null>(null);
    // The selection as it stood when a drag began. Every frame of the drag is
    // applied to this rather than to what the frame before it left, which is
    // what lets a drag give rows back as it shrinks.
    const dragBase = useRef<Set<string>>(new Set());

    const [optimisticApplications, applyOptimistic] = useOptimistic(
        applications,
        (
            state,
            action:
                | {
                      type: "status";
                      ids: Set<string>;
                      status: ApplicationStatus;
                      appliedAt: string;
                  }
                | {
                      type: "arrangement";
                      ids: Set<string>;
                      arrangement: Arrangement | null;
                  }
                | {
                      type: "ranking";
                      ids: Set<string>;
                      ranking: Ranking | null;
                  }
                | { type: "delete"; ids: Set<string> },
        ) => {
            if (action.type === "delete") {
                return state.filter((app) => !action.ids.has(app.id));
            }
            if (action.type === "status") {
                return state.map((app) =>
                    action.ids.has(app.id)
                        ? {
                              ...app,
                              status: action.status,
                              appliedAt:
                                  action.status === "applied"
                                      ? (app.appliedAt ?? action.appliedAt)
                                      : app.appliedAt,
                          }
                        : app,
                );
            }
            if (action.type === "ranking") {
                return state.map((app) =>
                    action.ids.has(app.id)
                        ? { ...app, ranking: action.ranking }
                        : app,
                );
            }
            return state.map((app) =>
                action.ids.has(app.id)
                    ? { ...app, arrangement: action.arrangement }
                    : app,
            );
        },
    );

    // The account's own currency leads the alphabet, being the one a column is
    // most often wanted in, and appears once rather than in both places.
    const currencyOptions = useMemo(
        () => [
            ORIGINAL_PAY,
            ...CURRENCY_OPTIONS.filter(
                (option) => option.value === defaultCurrency,
            ),
            ...CURRENCY_OPTIONS.filter(
                (option) => option.value !== defaultCurrency,
            ),
        ],
        [defaultCurrency],
    );

    const view = useMemo(
        () =>
            applicationsView(
                optimisticApplications,
                filters,
                sort,
                rates,
                convertTo,
                rankings,
            ),
        [optimisticApplications, filters, sort, rates, convertTo, rankings],
    );
    const filtered = isFiltered(filters);
    const rowWindow = useRowWindow(
        scrollRef,
        listRef,
        view.rows.length,
        ROW_REM,
    );

    // A tick belongs to a row on screen, and a row can leave the table while it
    // is ticked: the detail panel can write the very field the table is filtered
    // on. So the count, the appliers and the delete all read from the rows that
    // are showing rather than from everything the set still remembers.
    const selection = view.rows
        .filter((app) => selected.has(app.id))
        .map((app) => app.id);

    const bulkMode = drafts !== null;
    const allSelected =
        view.rows.length > 0 && selection.length === view.rows.length;

    // The row itself is looked up rather than held, so the panel redraws from
    // the list when a saved change comes back from the server.
    const editingRow = editing
        ? optimisticApplications.find((app) => app.id === editing.id)
        : undefined;

    // Reads already made, held only for as long as the rows they were made for.
    // A save, a bulk status change and an accepted inbox suggestion all come
    // back as a fresh array from the server, and any of them can have moved a
    // status trail underneath an entry, so the whole cache goes with it.
    const [cache, setCache] = useState(() => ({
        rows: applications,
        extras: new Map<string, ApplicationExtras>(),
    }));
    if (cache.rows !== applications) {
        setCache({ rows: applications, extras: new Map() });
    }
    const readExtras = cache.extras;
    const reading = useRef(new Set<string>());

    // Speculative, so it says nothing when it fails: the press that follows asks
    // again through openPanel, which does report it.
    const prefetchExtras = (id: string) => {
        if (readExtras.has(id) || reading.current.has(id)) return;
        reading.current.add(id);
        loadApplicationExtras(id)
            .then((extras) => {
                if (extras) readExtras.set(id, extras);
            })
            .catch(() => {})
            .finally(() => reading.current.delete(id));
    };

    // Fetched before the panel opens rather than inside it, so the panel has
    // everything the moment it appears and never has to reserve space for
    // fields it is still waiting on.
    //
    // A read that fails has to keep the panel shut. Empty notes are a value the
    // panel would happily save back over the real ones, so there is no standing
    // in for them: blank and unread are the same thing to a text box, and only
    // one of them is true.
    const openPanel = (id: string) => {
        const ready = readExtras.get(id);
        if (ready) {
            setEditing({ id, extras: ready });
            return;
        }

        setOpeningId(id);
        setBulkError(null);
        startMutation(async () => {
            try {
                const extras = await loadApplicationExtras(id);
                if (extras) {
                    readExtras.set(id, extras);
                    setEditing({ id, extras });
                } else {
                    setBulkError("That application is no longer there.");
                }
            } catch {
                setBulkError("Could not open this application. Try again.");
            }
            setOpeningId(null);
        });
    };

    const clearStaged = () => {
        setStagedStatus(null);
        setStagedArrangement(null);
        setStagedRanking(null);
    };

    // A staged value belongs to the selection it was staged for, so emptying the
    // selection by any route drops it rather than leaving it primed for the next.
    // Rows that have since left the table are dropped on the way in, so an empty
    // selection means the same thing here as it does on screen.
    const setSelection = (next: Set<string>) => {
        const showing = new Set(
            view.rows.filter((app) => next.has(app.id)).map((app) => app.id),
        );
        setSelected(showing);
        if (showing.size === 0) clearStaged();
    };

    const clearSelection = () => setSelection(new Set());

    // Every row from `from` to `to` takes `isSelected`, counting in the order
    // the table is showing rather than the order it was stored in, so a range
    // is the run the reader can see between the two rows they pointed at.
    const runOver = (
        base: Set<string>,
        from: number,
        to: number,
        isSelected: boolean,
    ) => {
        const next = new Set(base);
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
            const row = view.rows[i];
            if (!row) continue;
            if (isSelected) {
                next.add(row.id);
            } else {
                next.delete(row.id);
            }
        }
        return next;
    };

    // Where the anchor row stands in the table as it is showing now, or -1 if
    // it has since been sorted out of sight by a filter.
    const anchorIndex = () =>
        anchor.current === null
            ? -1
            : view.rows.findIndex((app) => app.id === anchor.current);

    const setAnchor = (index: number) => {
        anchor.current = view.rows[index]?.id ?? null;
    };

    // Shift extends from the last row ticked, which is what the gesture means
    // in every other list. The rows between take the state the pressed box is
    // going to, so a shift-click clears a run as readily as it fills one.
    const toggleSelected = (
        index: number,
        isSelected: boolean,
        extend: boolean,
    ) => {
        const anchored = anchorIndex();
        const from = extend && anchored >= 0 ? anchored : index;
        setAnchor(index);
        setSelection(runOver(selected, from, index, isSelected));
    };

    const toggleAll = (isSelected: boolean) => {
        anchor.current = null;
        setSelection(
            isSelected ? new Set(view.rows.map((app) => app.id)) : new Set(),
        );
    };

    const startDrag = useDragSelect({
        scrollRef,
        listRef,
        rowRem: ROW_REM,
        count: view.rows.length,
        onPaint: (from, to, isSelected) =>
            setSelection(runOver(dragBase.current, from, to, isSelected)),
        onSettle: setAnchor,
    });

    // The rows are memoised, so what they are handed has to hold still from one
    // render to the next or the memo buys nothing. These reach the current
    // render through a ref instead: handing a row a fresh closure would redraw
    // every row on every tick, and letting a row keep an old one would have
    // shift-click measure a range against a selection that has moved on.
    const live = useRef({
        toggleSelected,
        startDrag,
        openPanel,
        prefetchExtras,
        selected,
    });
    useEffect(() => {
        live.current = {
            toggleSelected,
            startDrag,
            openPanel,
            prefetchExtras,
            selected,
        };
    });

    const rowActions = useMemo<RowActions>(
        () => ({
            select: (index, isSelected, extend) =>
                live.current.toggleSelected(index, isSelected, extend),
            press: (event, index) => {
                // The run a drag paints is laid over the selection as it stood
                // when the press landed, so here is where that is taken.
                dragBase.current = live.current.selected;
                live.current.startDrag(event, index, !event.altKey);
            },
            edit: (id) => live.current.openPanel(id),
            prefetch: (id) => live.current.prefetchExtras(id),
            remove: (id) => setDeletingId(id),
        }),
        [],
    );

    // Escape leaves a selection, since every other way out of one is a button
    // somewhere in the bar. Anything laid over the table answers the key first
    // and this stands down for it, so Escape always shuts the nearest thing.
    const overlaid =
        Boolean(editing || permanentDelete || deletingId) ||
        confirmingDelete ||
        adding ||
        importing;
    const escapeClears = selection.length > 0 && !bulkMode && !overlaid;
    // Held in a ref so the key binding does not have to be torn down and laid
    // again on every render just to reach the selection of the latest one.
    const clearRef = useRef(clearSelection);
    useEffect(() => {
        clearRef.current = clearSelection;
    });
    useEffect(() => {
        if (!escapeClears) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") clearRef.current();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [escapeClears]);

    // A refused write leaves the optimistic row to be discarded when the
    // transition ends, which puts the table back the way it was. Saying so is
    // the missing half: without it the row would slide back with no reason
    // given. The refusals worth reaching a person are all things they can act
    // on, and the wait behind them is seconds.
    const reportRefusal = (result: ActionResult) => {
        if (!result.ok) toast.error(result.error);
    };

    const onDelete = (id: string) => {
        setDeletingId(null);
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids: new Set([id]) });
            reportRefusal(await removeApplication(listId, id));
        });
    };

    const onPermanentDelete = (id: string) => {
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids: new Set([id]) });
            const result = await permanentlyRemoveApplication(listId, id);
            reportRefusal(result);
            if (result.ok) toast.success("Application permanently deleted");
        });
    };

    // What is on screen is what gets edited, so a filtered table opens an editor
    // over the rows it is showing. The search and filter controls stand down for
    // the duration, which is what keeps that set from moving underneath it.
    const startBulkEdit = () => {
        setBulkError(null);
        setDrafts(new Map(view.rows.map((app) => [app.id, draftOf(app)])));
    };

    // What is on screen is what leaves, so a filtered table writes a file of the
    // rows it is showing, in the order it is showing them. The menu says which.
    const exportRows = async (format: ExportFormat) => {
        try {
            const { applicationsFile } =
                await import("@/components/dashboard/applications-export");
            saveBlob(
                applicationsFile(view.rows, format, name, rankings),
                `${fileSlug(name)}-applications.${format}`,
            );
        } catch {
            toast.error("Could not export these applications.");
        }
    };

    const setDraftField = <K extends keyof Draft>(
        id: string,
        key: K,
        value: Draft[K],
    ) =>
        setDrafts((current) => {
            if (!current) return current;
            const draft = current.get(id);
            if (!draft) return current;
            const next = new Map(current);
            const changed = { ...draft, [key]: value };
            if (key === "status" && value === "applied" && !changed.appliedAt) {
                changed.appliedAt = todayDateInput();
            }
            next.set(id, changed);
            return next;
        });

    const saveBulk = async () => {
        if (!drafts || bulkSaving) return;
        const byId = new Map(
            optimisticApplications.map((app) => [app.id, app]),
        );
        const changed = [...drafts]
            .map(([id, draft]) => ({ app: byId.get(id), draft }))
            .filter(
                (row): row is { app: ApplicationRow; draft: Draft } =>
                    row.app !== undefined &&
                    !sameDraft(row.draft, draftOf(row.app)),
            );

        if (changed.length === 0) {
            setDrafts(null);
            return;
        }

        setBulkSaving(true);
        setBulkError(null);
        const result = await updateApplicationsBulk(
            listId,
            changed.map((row) => ({
                id: row.app.id,
                input: asDraftInput(row.draft),
                // One line of text cannot hold everything the detail panel can
                // put in the pay columns, so an untouched box leaves them be.
                payTyped: row.draft.pay !== draftOf(row.app).pay,
            })),
            browserTimeZone(),
        );
        setBulkSaving(false);
        if (result.ok) {
            setDrafts(null);
        } else {
            setBulkError(result.error);
        }
    };

    const applyStatus = (status: ApplicationStatus) => {
        const ids = new Set(selection);
        const appliedAt = todayDateInput();
        const timeZone = browserTimeZone();
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "status", ids, status, appliedAt });
            reportRefusal(
                await setApplicationsStatus(listId, [...ids], status, timeZone),
            );
        });
    };

    const applyArrangement = (arrangement: Arrangement | null) => {
        const ids = new Set(selection);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "arrangement", ids, arrangement });
            reportRefusal(
                await setApplicationsArrangement(listId, [...ids], arrangement),
            );
        });
    };

    const applyRanking = (ranking: Ranking | null) => {
        const ids = new Set(selection);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "ranking", ids, ranking });
            reportRefusal(
                await setApplicationsRanking(listId, [...ids], ranking),
            );
        });
    };

    const deleteSelected = () => {
        const ids = new Set(selection);
        clearSelection();
        startMutation(async () => {
            applyOptimistic({ type: "delete", ids });
            reportRefusal(await removeApplications(listId, [...ids]));
        });
    };

    // Every applier reads the selection of this render and clears the staged
    // values on its way out, so they can run back to back.
    const applyStaged = () => {
        if (stagedStatus) applyStatus(stagedStatus);
        if (stagedArrangement) applyArrangement(stagedArrangement.value);
        if (stagedRanking) applyRanking(stagedRanking.value);
    };

    const selecting = selection.length > 0 && !bulkMode;

    return (
        <section className="border border-hairline bg-background">
            {/* The bulk controls take over the header row rather than adding
                one, so selecting a row tints this bar instead of pushing the
                whole table down. The bar wraps rather than scrolls: its controls
                are how you leave the selection, so none of them may end up off
                the side of a phone. */}
            <div
                className={`flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-5 py-2 lg:py-0 ${selecting ? "bg-surface" : ""}`}
            >
                {selecting ? (
                    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
                        <p className="shrink-0 text-xs text-sub">
                            <span className="font-medium text-ink tabular-nums">
                                {selection.length}
                            </span>{" "}
                            selected
                        </p>
                        <Divider />
                        <div className="flex flex-wrap items-center gap-2">
                            <CellSelect
                                label="Set status for selected"
                                placeholder={
                                    stagedStatus ? undefined : "Set status"
                                }
                                value={stagedStatus}
                                options={STAGED_STATUS_OPTIONS}
                                onChange={(status) =>
                                    setStagedStatus(
                                        status === UNCHANGED ? null : status,
                                    )
                                }
                                className="w-32"
                                variant="form"
                                searchable
                            />
                            <CellSelect
                                label="Set arrangement for selected"
                                placeholder={
                                    stagedArrangement
                                        ? undefined
                                        : "Set arrangement"
                                }
                                value={stagedArrangement?.value ?? null}
                                options={STAGED_ARRANGEMENT_OPTIONS}
                                onChange={(arrangement) =>
                                    setStagedArrangement(
                                        arrangement === UNCHANGED
                                            ? null
                                            : { value: arrangement },
                                    )
                                }
                                className="w-36"
                                variant="form"
                            />
                            {/* Only where the column is: a ranking written
                                here would otherwise land somewhere nobody can
                                see it. */}
                            {rankings && (
                                <CellSelect
                                    label="Set ranking for selected"
                                    placeholder={
                                        stagedRanking
                                            ? undefined
                                            : "Set ranking"
                                    }
                                    value={stagedRanking?.value ?? null}
                                    options={STAGED_RANKING_OPTIONS}
                                    onChange={(ranking) =>
                                        setStagedRanking(
                                            ranking === UNCHANGED
                                                ? null
                                                : { value: ranking },
                                        )
                                    }
                                    className="w-32"
                                    variant="form"
                                />
                            )}
                            <button
                                type="button"
                                onClick={applyStaged}
                                disabled={
                                    !stagedStatus &&
                                    !stagedArrangement &&
                                    !stagedRanking
                                }
                                className={primaryButtonClass}
                            >
                                Apply to {selection.length}
                            </button>
                        </div>
                        <Divider />
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            className={`${quietButtonClass} hover:text-rose`}
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--trash-2] size-3.5"
                            />
                            Delete
                        </button>
                        {/* Said at the one moment it can be acted on: a reader
                            holding a single row is about to reach for the
                            second. It goes once the range exists, so it never
                            settles in as another fixed word in the bar.

                            The bar wraps, and a line of it wrapping would
                            shove the table down the moment a row was ticked,
                            so the hint is dropped at any width that cannot
                            spare it. A Ranking column takes a picker's worth
                            of that width, which is why it waits for a wider
                            window. */}
                        {selection.length === 1 && (
                            <p
                                className={`ml-auto text-xs text-muted ${rankings ? "max-2xl:hidden" : "max-xl:hidden"}`}
                            >
                                Drag or shift-click for a range, Alt-drag to
                                remove
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={clearSelection}
                            className={`${quietButtonClass} ml-auto`}
                        >
                            Clear
                        </button>
                    </div>
                ) : (
                    <>
                        {/* A message reads with the heading rather than from
                            among the controls, where it used to shove every
                            button along the moment it appeared. Here it takes
                            width the toolbar was not using, and keeps a floor
                            wide enough to be worth reading: a window too narrow
                            to spare that much wraps the controls under it
                            instead, since an error nobody can read is worse
                            than a toolbar that takes two lines to say it. */}
                        <div className="flex flex-1 items-baseline gap-3">
                            <h2 className="flex shrink-0 items-baseline gap-2 text-xs font-medium text-muted">
                                {drafts
                                    ? `Editing ${countLabel(drafts.size)}`
                                    : "Applications"}
                                {!bulkMode && (
                                    <span className="text-sub tabular-nums">
                                        {filtered
                                            ? `${view.rows.length} of ${optimisticApplications.length}`
                                            : optimisticApplications.length}
                                    </span>
                                )}
                            </h2>
                            {bulkError && (
                                <p
                                    title={bulkError}
                                    className="min-w-32 truncate text-xs text-rose"
                                >
                                    {bulkError}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
                            {bulkMode ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDrafts(null);
                                            setBulkError(null);
                                        }}
                                        className={`${ghostButtonClass} ${FILL_NARROW}`}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveBulk}
                                        disabled={bulkSaving}
                                        className={`${primaryButtonClass} ${FILL_NARROW}`}
                                    >
                                        {bulkSaving ? "Saving" : "Save all"}
                                    </button>
                                </>
                            ) : (
                                <>
                                    {optimisticApplications.length > 0 && (
                                        // Held together on one line so the
                                        // filter button ends it. Its menu hangs
                                        // from the button's right edge, and on a
                                        // phone that edge is the only one with
                                        // the menu's width behind it.
                                        <div className="flex items-center gap-2 max-sm:w-full">
                                            <SearchField
                                                value={filters.query}
                                                onChange={(query) =>
                                                    setFilters({
                                                        ...filters,
                                                        query,
                                                    })
                                                }
                                            />
                                            <ApplicationsFilterMenu
                                                filters={filters}
                                                statusCounts={view.statusCounts}
                                                arrangementCounts={
                                                    view.arrangementCounts
                                                }
                                                onChange={setFilters}
                                            />
                                        </div>
                                    )}
                                    <CellSelect
                                        value={convertTo}
                                        options={currencyOptions}
                                        onChange={setConvertTo}
                                        label="Currency to read pay in"
                                        triggerLabel={
                                            convertTo
                                                ? `Pay in ${convertTo}`
                                                : "Pay currency"
                                        }
                                        variant="button"
                                        searchable
                                        // Held at the width of its longest
                                        // label, so choosing a currency does
                                        // not shove the controls beside it.
                                        className="max-sm:grow sm:w-44"
                                    />
                                    {view.rows.length > 0 && (
                                        <>
                                            {viewing ? null : (
                                                <button
                                                    type="button"
                                                    onClick={startBulkEdit}
                                                    className={`${secondaryButtonClass} ${FILL_NARROW}`}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className="icon-[lucide--pencil-line] size-4 shrink-0"
                                                    />
                                                    {filtered
                                                        ? "Edit shown"
                                                        : "Edit all"}
                                                </button>
                                            )}
                                            <DownloadMenu
                                                title="Export these applications"
                                                heading={
                                                    filtered
                                                        ? `${view.rows.length} shown`
                                                        : countLabel(
                                                              view.rows.length,
                                                          )
                                                }
                                                formats={EXPORT_FORMATS}
                                                className="max-sm:grow"
                                                triggerClass={`${secondaryButtonClass} max-sm:w-full max-sm:justify-center`}
                                                onSelect={exportRows}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--download] size-4 shrink-0"
                                                />
                                                Export
                                            </DownloadMenu>
                                        </>
                                    )}
                                    {/* Outside the guard above: an empty list is
                                    exactly where someone arriving from another
                                    tracker starts. */}
                                    {viewing ? null : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setImporting(true)
                                                }
                                                className={`${secondaryButtonClass} ${FILL_NARROW}`}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--upload] size-4 shrink-0"
                                                />
                                                Import
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAdding(true)}
                                                className={`${primaryButtonClass} ${FILL_NARROW}`}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="icon-[lucide--plus] mr-1.5 size-4 shrink-0"
                                                />
                                                Add application
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            {adding && !bulkMode && (
                <OverlayDrawer onClose={() => setAdding(false)}>
                    <AddApplicationForm
                        listId={listId}
                        defaultCurrency={defaultCurrency}
                        cleanLinks={cleanLinks}
                        employerLinks={employerLinks}
                        tidyTitles={tidyTitles}
                        rankings={rankings}
                        rates={rates}
                    />
                </OverlayDrawer>
            )}

            {importing && !bulkMode && (
                <OverlayDialog
                    className="m-auto max-h-[85vh] w-180 max-w-[calc(100vw-2rem)] border-0 bg-background p-0 shadow-lg backdrop:bg-ink/25"
                    panelClassName="flex max-h-[85vh] flex-col"
                    onClose={() => setImporting(false)}
                >
                    <ImportDialog
                        listId={listId}
                        applications={optimisticApplications}
                        defaultCurrency={defaultCurrency}
                        rates={rates}
                    />
                </OverlayDialog>
            )}

            {optimisticApplications.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-sub">
                    No applications in this list yet.
                </p>
            ) : view.rows.length === 0 ? (
                <div className="px-5 py-16 text-center">
                    <p className="text-sm text-sub">
                        No applications match this search.
                    </p>
                    <button
                        type="button"
                        onClick={() => setFilters(NO_FILTERS)}
                        className={`${quietButtonClass} mt-3`}
                    >
                        Clear search and filters
                    </button>
                </div>
            ) : (
                <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
                    <ApplicationsHeaderRow
                        rankings={rankings}
                        sort={sort}
                        // An open editor holds a field under the pointer, and
                        // reordering the rows would move it out from under one
                        // keystroke to the next.
                        onSort={
                            bulkMode
                                ? undefined
                                : (key) =>
                                      setSort((current) =>
                                          nextSort(current, key),
                                      )
                        }
                        selectAll={
                            !bulkMode &&
                            !viewing && (
                                <SelectAllBox
                                    showing={view.rows.length}
                                    all={allSelected}
                                    some={selection.length > 0 && !allSelected}
                                    onChange={() =>
                                        toggleAll(selection.length === 0)
                                    }
                                />
                            )
                        }
                    />
                    <ul ref={listRef}>
                        {rowWindow.padTop > 0 && (
                            <li
                                aria-hidden="true"
                                style={{
                                    height: `${rowWindow.padTop * ROW_REM}rem`,
                                }}
                            />
                        )}
                        {view.rows
                            .slice(rowWindow.start, rowWindow.end)
                            .map((app, drawn) => {
                                // Where the row stands in the whole table, not
                                // in the handful drawn, since that is what a
                                // range is counted in.
                                const index = rowWindow.start + drawn;
                                const draft = drafts?.get(app.id);
                                if (draft) {
                                    return (
                                        <BulkRow
                                            key={app.id}
                                            draft={draft}
                                            columns={grid.columns}
                                            rankings={rankings}
                                            updated={app.updated}
                                            updatedAt={app.updatedAt}
                                            onChange={(key, value) =>
                                                setDraftField(
                                                    app.id,
                                                    key,
                                                    value,
                                                )
                                            }
                                        />
                                    );
                                }
                                if (app.id === deletingId) {
                                    return (
                                        <DeleteRow
                                            key={app.id}
                                            label={app.company}
                                            minWidth={grid.minWidth}
                                            onConfirm={() => onDelete(app.id)}
                                            onPermanent={() => {
                                                setDeletingId(null);
                                                setPermanentDelete({
                                                    id: app.id,
                                                    label: app.company,
                                                });
                                            }}
                                            onCancel={() => setDeletingId(null)}
                                        />
                                    );
                                }
                                return (
                                    <ReadRow
                                        key={app.id}
                                        app={app}
                                        columns={grid.columns}
                                        rankings={rankings}
                                        convertedPay={
                                            convertTo &&
                                            payInCurrency(app, convertTo, rates)
                                        }
                                        index={index}
                                        selected={selected.has(app.id)}
                                        viewing={viewing}
                                        opening={openingId === app.id}
                                        actions={rowActions}
                                    />
                                );
                            })}
                        {rowWindow.padBottom > 0 && (
                            <li
                                aria-hidden="true"
                                style={{
                                    height: `${rowWindow.padBottom * ROW_REM}rem`,
                                }}
                            />
                        )}
                    </ul>
                </div>
            )}

            {editing && editingRow && (
                <OverlayDrawer onClose={() => setEditing(null)}>
                    <ApplicationPanel
                        listId={listId}
                        app={editingRow}
                        extras={editing.extras}
                        rankings={rankings}
                    />
                </OverlayDrawer>
            )}

            {confirmingDelete && (
                <ConfirmDialog
                    title={`Delete ${countLabel(selection.length)}?`}
                    detail="You can undo this from History."
                    confirmLabel="Delete"
                    tone="danger"
                    onConfirm={() => {
                        deleteSelected();
                        setConfirmingDelete(false);
                    }}
                    onCancel={() => setConfirmingDelete(false)}
                />
            )}

            {permanentDelete && (
                <ConfirmDialog
                    title={`Permanently delete ${permanentDelete.label}?`}
                    detail="This removes the application from this list and from History. It cannot be restored or undone."
                    confirmLabel="Delete permanently"
                    tone="danger"
                    onConfirm={() => {
                        onPermanentDelete(permanentDelete.id);
                        setPermanentDelete(null);
                    }}
                    onCancel={() => setPermanentDelete(null)}
                />
            )}
        </section>
    );
};
