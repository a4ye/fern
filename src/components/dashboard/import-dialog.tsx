"use client";

import { useMemo, useState, type DragEvent } from "react";
import { commitImport, readImportFile } from "@/app/dashboard/import-actions";
import {
    browserTimeZone,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";
import {
    ARRANGEMENT_OPTIONS,
    CellSelect,
    STATUS_OPTIONS,
    checkboxClass,
    ghostButtonClass,
    primaryButtonClass,
    secondaryButtonClass,
} from "@/components/dashboard/table-controls";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import {
    IMPORT_FIELDS,
    matchColumns,
    type ColumnMapping,
    type ImportField,
} from "@/lib/import/fields";
import {
    arrangementFor,
    buildRows,
    distinctValues,
    existingIndex,
    statusFor,
    valueKey,
    type ImportDraft,
    type RowOutcome,
    type Sheet,
} from "@/lib/import/rows";

const TITLE_ID = "import-dialog-title";

type Step = "file" | "map" | "review";

// Unmapped is a real answer rather than a missing one, so it sits in the list
// instead of being the absence of a choice.
const NO_COLUMN = -1;

const countLabel = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

// Every row in the mapping step sits on the same three columns, whether its
// label is one of this app's field names or a phrase lifted out of the sheet.
// The label wraps rather than truncating: the whole point of the status rows is
// to read what the file actually said, and "Submitted - Pending Response" says
// nothing cut off at "Submitted - Pend...".
// Three columns need 26rem before they need anything, which is wider than a
// phone, so on a narrow screen the row folds: what the file says on one line,
// what it becomes on the next.
const ROW_GRID =
    "sm:grid sm:grid-cols-[10rem_minmax(0,15rem)_minmax(0,1fr)] sm:gap-3";

const Row = ({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) => (
    <div
        className={`${ROW_GRID} max-sm:space-y-1.5 max-sm:border-b max-sm:border-faint max-sm:pb-3 max-sm:last:border-b-0 max-sm:last:pb-0 sm:items-center`}
    >
        <div className="flex items-baseline justify-between gap-3 sm:contents">
            <span className="min-w-0 text-pretty break-words text-xs text-ink">
                {label}
            </span>
            {/* The label is the question and keeps its width; the sample takes
            what is left and truncates there. A pay cell can run to a sentence,
            and it may not be the thing that breaks "Arrangement" in half. */}
            <span
                title={hint}
                className="min-w-0 truncate text-xs text-muted max-sm:flex-1 max-sm:text-right sm:order-last"
            >
                {hint}
            </span>
        </div>
        {children}
    </div>
);

// Names the three columns once, so the rows under them do not have to be
// puzzled out from their contents. Folded rows name themselves, so the headings
// go with the columns they head.
const RowHeader = ({
    left,
    middle,
    right,
}: {
    left: string;
    middle: string;
    right: string;
}) => (
    <div
        className={`${ROW_GRID} max-sm:hidden border-b border-faint pb-1.5 text-xs text-muted`}
    >
        <span>{left}</span>
        <span>{middle}</span>
        <span>{right}</span>
    </div>
);

// An option named in a sentence is a thing on the screen rather than a turn of
// phrase, so it is set on a plate and picked out of the prose around it. The
// fill is the one the neutral status plates use, which is the lightest this app
// has that still reads as a plate.
const Term = ({ children }: { children: React.ReactNode }) => (
    <span className="whitespace-nowrap bg-hairline px-1 py-0.5 font-medium text-ink">
        {children}
    </span>
);

// The section title carries the weight and the sentence under it explains the
// step, so the two do not compete at the same size.
const Section = ({
    title,
    note,
    children,
}: {
    title: string;
    note: React.ReactNode;
    children: React.ReactNode;
}) => (
    <section>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 max-w-prose text-pretty text-xs leading-5 text-sub">
            {note}
        </p>
        <div className="mt-4">{children}</div>
    </section>
);

// Where the user is, and what is still ahead. Three short words beat a progress
// bar here: the steps have names, and the names say what each one asks for.
const STEPS: { id: Step; label: string }[] = [
    { id: "file", label: "File" },
    { id: "map", label: "Columns" },
    { id: "review", label: "Review" },
];

const Stepper = ({ step }: { step: Step }) => {
    const at = STEPS.findIndex((entry) => entry.id === step);
    return (
        <ol className="flex items-center gap-2">
            {STEPS.map((entry, index) => (
                <li key={entry.id} className="flex items-center gap-2">
                    {index > 0 && (
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--chevron-right] size-3 text-muted"
                        />
                    )}
                    <span
                        aria-current={index === at ? "step" : undefined}
                        className={
                            index === at
                                ? "text-xs font-medium text-ink"
                                : "text-xs text-muted"
                        }
                    >
                        {entry.label}
                    </span>
                </li>
            ))}
        </ol>
    );
};

const FileStep = ({
    busy,
    onPick,
}: {
    busy: boolean;
    onPick: (file: File) => void;
}) => {
    const [over, setOver] = useState(false);

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onPick(file);
    };

    return (
        <div className="space-y-5">
            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center border border-dashed px-5 py-12 text-center transition-colors ${over ? "border-accent bg-accent-tint-soft" : "border-tile-border bg-surface"}`}
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--table-2] size-6 text-muted"
                />
                <p className="mt-3 text-sm font-medium text-ink">
                    {busy ? "Reading your file" : "Drop a spreadsheet here"}
                </p>
                <p className="mt-1 text-xs text-sub">
                    CSV or Excel, up to 2 MB.
                </p>
                <label
                    className={`${secondaryButtonClass} mt-4 ${busy ? "pointer-events-none opacity-50" : ""}`}
                >
                    Choose file
                    <input
                        type="file"
                        accept=".csv,.tsv,.xlsx"
                        disabled={busy}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            // Cleared so picking the same file twice still
                            // fires.
                            event.target.value = "";
                            if (file) onPick(file);
                        }}
                        className="sr-only"
                    />
                </label>
            </div>

            {/* A first-time importer has no idea what they are agreeing to.
            Saying it up front is shorter than any of them finding out. */}
            <div className="space-y-2.5 border-t border-faint pt-4">
                <p className="text-xs font-medium text-ink">
                    What happens next
                </p>
                <Note icon="icon-[lucide--columns-3]">
                    You choose which column goes into each field. Most are
                    matched already.
                </Note>
                <Note icon="icon-[lucide--check-check]">
                    You see what will be added before anything is saved.
                </Note>
                <Note icon="icon-[lucide--shield-check]">
                    Your file is not stored. Applications are only added to this
                    list.
                </Note>
            </div>
        </div>
    );
};

const Note = ({
    icon,
    children,
}: {
    icon: string;
    children: React.ReactNode;
}) => (
    <p className="flex items-start gap-2.5 text-pretty text-xs leading-5 text-sub">
        <span
            aria-hidden="true"
            className={`${icon} mt-0.5 size-3.5 shrink-0 text-accent-deep`}
        />
        {children}
    </p>
);

// A column's first filled cell, which is what tells someone whether the heading
// they matched is the one they meant.
const sampleOf = (sheet: Sheet, column: number): string => {
    for (const row of sheet.rows) {
        const cell = (row[column] ?? "").trim();
        if (cell) return cell;
    }
    return "";
};

// How many rows say each thing, which is what says whether a value is worth
// stopping over or is one stray cell.
const countsOf = (sheet: Sheet, column: number | undefined) => {
    const counts = new Map<string, number>();
    if (column === undefined) return counts;
    for (const row of sheet.rows) {
        const cell = (row[column] ?? "").trim();
        if (!cell) continue;
        const key = valueKey(cell);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
};

const MapStep = ({
    sheet,
    mapping,
    statusEdits,
    arrangementEdits,
    fallbackStatus,
    onMap,
    onStatus,
    onArrangement,
    onFallbackStatus,
}: {
    sheet: Sheet;
    mapping: ColumnMapping;
    statusEdits: Record<string, ApplicationStatus>;
    arrangementEdits: Record<string, Arrangement | null>;
    fallbackStatus: ApplicationStatus;
    onMap: (field: string, column: number) => void;
    onStatus: (value: string, status: ApplicationStatus) => void;
    onArrangement: (value: string, arrangement: Arrangement | null) => void;
    onFallbackStatus: (status: ApplicationStatus) => void;
}) => {
    const columnOptions = useMemo(
        () => [
            { value: NO_COLUMN, label: "Not imported" },
            ...sheet.headers.map((header, index) => ({
                value: index,
                label: header || `Column ${index + 1}`,
            })),
        ],
        [sheet.headers],
    );

    // Which fields the file itself answered, read from the sheet rather than
    // from the live mapping: a row may not leave the list under your finger
    // because you set it to Not imported.
    const matched = useMemo(() => matchColumns(sheet.headers), [sheet.headers]);
    const [showUnmatched, setShowUnmatched] = useState(false);
    const asked = IMPORT_FIELDS.filter(
        (field) => field.required || matched[field.key] !== undefined,
    );
    const unmatched = IMPORT_FIELDS.filter(
        (field) => !field.required && matched[field.key] === undefined,
    );

    const fieldRow = (field: (typeof IMPORT_FIELDS)[number]) => {
        const column = mapping[field.key];
        return (
            <Row
                key={field.key}
                label={field.required ? `${field.label} *` : field.label}
                hint={column === undefined ? "" : sampleOf(sheet, column)}
            >
                <CellSelect
                    label={field.label}
                    value={column ?? NO_COLUMN}
                    options={columnOptions}
                    onChange={(next) => onMap(field.key, next)}
                    variant="form"
                    searchable
                />
            </Row>
        );
    };

    const statusValues = distinctValues(sheet, mapping.status);
    const arrangementValues = distinctValues(sheet, mapping.arrangement);
    const statusCounts = countsOf(sheet, mapping.status);
    const arrangementCounts = countsOf(sheet, mapping.arrangement);

    // Every value the column holds gets a row of its own above, so the only
    // rows left for the picker below are the ones whose status cell is empty.
    // Where there are none, the picker has nothing to answer for and is left
    // out rather than sitting there meaning nothing.
    const statusMapped = mapping.status !== undefined;
    const filledStatuses = [...statusCounts.values()].reduce(
        (total, count) => total + count,
        0,
    );
    const blankStatuses = statusMapped
        ? sheet.rows.length - filledStatuses
        : sheet.rows.length;

    return (
        <div className="space-y-8">
            <Section
                title="Match your columns"
                note={
                    <>
                        Check each match. <Term>Not imported</Term> leaves a
                        field blank.
                    </>
                }
            >
                <div className="space-y-3 sm:space-y-2">
                    <RowHeader
                        left="Field"
                        middle="Your column"
                        right="First value"
                    />
                    {asked.map(fieldRow)}
                </div>

                {/* Nothing in the file reaches these, so there is nothing to
                check: they are folded away rather than filling the step with
                rows that all read Not imported. */}
                {unmatched.length > 0 && (
                    <div className="mt-3 border-t border-faint pt-3">
                        <button
                            type="button"
                            onClick={() =>
                                setShowUnmatched((previous) => !previous)
                            }
                            aria-expanded={showUnmatched}
                            className="flex cursor-pointer items-center gap-1.5 text-xs text-sub transition-colors hover:text-ink focus-visible:outline-1 focus-visible:outline-accent"
                        >
                            <span
                                aria-hidden="true"
                                className={`icon-[lucide--chevron-right] size-3.5 shrink-0 transition-transform ${showUnmatched ? "rotate-90" : ""}`}
                            />
                            {countLabel(unmatched.length, "field")} not matched
                            to a column
                        </button>
                        {showUnmatched && (
                            <div className="mt-4 space-y-3 sm:space-y-2">
                                {unmatched.map(fieldRow)}
                            </div>
                        )}
                    </div>
                )}
            </Section>

            <Section
                title="Match your statuses"
                note={
                    statusValues.length > 0
                        ? "Each choice applies to every row with that value."
                        : "Your file has no status column. Every application starts at the status you choose."
                }
            >
                <div className="space-y-3 sm:space-y-2">
                    {statusValues.length > 0 && (
                        <RowHeader
                            left="Your file says"
                            middle="Maps to"
                            right="Rows"
                        />
                    )}
                    {statusValues.map((value) => (
                        <Row
                            key={value}
                            label={value}
                            hint={countLabel(
                                statusCounts.get(valueKey(value)) ?? 0,
                                "row",
                            )}
                        >
                            <CellSelect
                                label={`Status for ${value}`}
                                value={statusFor(
                                    value,
                                    statusEdits,
                                    fallbackStatus,
                                )}
                                options={STATUS_OPTIONS}
                                onChange={(status) => onStatus(value, status)}
                                variant="form"
                                searchable
                            />
                        </Row>
                    ))}
                    {blankStatuses > 0 && (
                        <Row
                            label={
                                statusMapped
                                    ? "Rows with no status"
                                    : "Every row"
                            }
                            hint={countLabel(blankStatuses, "row")}
                        >
                            <CellSelect
                                label="Status for rows with no status"
                                value={fallbackStatus}
                                options={STATUS_OPTIONS}
                                onChange={onFallbackStatus}
                                variant="form"
                                searchable
                            />
                        </Row>
                    )}
                </div>
            </Section>

            {arrangementValues.length > 0 && (
                <Section
                    title="Match your arrangements"
                    note={
                        <>
                            Anything left on <Term>Not set</Term> stays blank.
                        </>
                    }
                >
                    <div className="space-y-3 sm:space-y-2">
                        <RowHeader
                            left="Your file says"
                            middle="Maps to"
                            right="Rows"
                        />
                        {arrangementValues.map((value) => (
                            <Row
                                key={value}
                                label={value}
                                hint={countLabel(
                                    arrangementCounts.get(valueKey(value)) ?? 0,
                                    "row",
                                )}
                            >
                                <CellSelect
                                    label={`Arrangement for ${value}`}
                                    value={arrangementFor(
                                        value,
                                        arrangementEdits,
                                    )}
                                    options={ARRANGEMENT_OPTIONS}
                                    onChange={(arrangement) =>
                                        onArrangement(value, arrangement)
                                    }
                                    variant="form"
                                    searchable
                                />
                            </Row>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
};

// `lead` marks the figure the step is about, so the eye lands on what is being
// added rather than on what is not. Three abreast is three labels in a column
// each too narrow to hold one, so on a phone they turn on their side and the
// figures line up down the right.
const Tally = ({
    label,
    value,
    lead = false,
}: {
    label: string;
    value: number;
    lead?: boolean;
}) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-faint px-4 py-2.5 last:border-b-0 sm:block sm:border-r sm:border-b-0 sm:py-3 sm:last:border-r-0">
        <p
            className={`order-last text-lg leading-none tabular-nums ${lead ? "font-medium text-ink" : "text-sub"}`}
        >
            {value}
        </p>
        <p className="text-xs text-muted sm:mt-1.5">{label}</p>
    </div>
);

// A grid rather than fixed widths on a flex row: "Row 7" and "Row 104" are
// different widths, and a column too narrow for the longest of them wraps that
// one line and leaves the list with rows of two different heights.
// A phone has room for the company and one figure beside it, so the row leads
// with the company, the line number goes to the right as the metadata it is,
// and the detail takes a line of its own underneath rather than halving the
// width and leaving both ends truncated.
const OUTCOME_GRID =
    "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[4.5rem_minmax(0,11rem)_minmax(0,1fr)] sm:items-center sm:gap-3";

const DETAIL_CELL = "truncate text-xs max-sm:order-3 max-sm:col-span-2";

const OutcomeLine = ({
    line,
    company,
    detail,
}: {
    line: number;
    company: string;
    detail: React.ReactNode;
}) => (
    <>
        <span className="whitespace-nowrap text-xs text-muted max-sm:order-2 max-sm:justify-self-end">
            Row {line}
        </span>
        <span
            className="truncate text-xs text-ink max-sm:order-1"
            title={company}
        >
            {company || "(no company)"}
        </span>
        <span className={`${DETAIL_CELL} text-sub`}>{detail}</span>
    </>
);

// Three headings for three columns. A folded row leads with the company and
// says "Row 4" in as many words, so the headings go with the columns and the
// note above the list covers what the third line holds. `inset` clears the
// checkbox on the one list whose rows can be picked.
const OutcomeHeader = ({
    detail,
    inset = false,
}: {
    detail: string;
    inset?: boolean;
}) => (
    <div
        className={`${OUTCOME_GRID} max-sm:hidden border-b border-faint bg-surface px-3 py-1.5 text-xs text-muted ${inset ? "pl-9" : ""}`}
    >
        <span>Your row</span>
        <span>Company</span>
        <span className={DETAIL_CELL}>{detail}</span>
    </div>
);

const fieldLabel = (field: ImportField): string =>
    IMPORT_FIELDS.find((entry) => entry.key === field)?.label ?? field;

// What an existing application looks like when it has to be told apart from the
// row that matched it. Company is already in its own column, so the parts that
// are not repeated there are the ones worth printing.
const existingLabel = (row: ApplicationRow): string =>
    [row.role, row.appliedAt && `applied ${row.appliedAt}`]
        .filter(Boolean)
        .join(", ") || "no role or date";

const ReviewStep = ({
    outcomes,
    keeping,
    onKeep,
    onKeepAll,
}: {
    outcomes: RowOutcome[];
    keeping: ReadonlySet<number>;
    onKeep: (line: number, keep: boolean) => void;
    onKeepAll: (keep: boolean) => void;
}) => {
    const ready = outcomes.filter((outcome) => outcome.kind === "ready");
    const duplicates = outcomes.filter(
        (outcome) => outcome.kind === "duplicate",
    );
    const invalid = outcomes.filter((outcome) => outcome.kind === "invalid");
    const keptAll = duplicates.every((row) => keeping.has(row.line));

    const adding =
        ready.length + duplicates.filter((row) => keeping.has(row.line)).length;

    // Rows that import, but not whole. They are counted under Adding rather
    // than beside it, since that is what happens to them.
    const partial = ready.filter((row) => row.dropped.length > 0);

    return (
        <div className="space-y-8">
            {/* The three figures answer the only question this step exists to
            answer, before any of the lists under them are read. */}
            <div className="grid border border-hairline sm:grid-cols-3">
                <Tally label="Adding" value={adding} lead />
                <Tally label="Already in this list" value={duplicates.length} />
                <Tally label="Skipped" value={invalid.length} />
            </div>

            {duplicates.length > 0 && (
                <section>
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                        <div className="min-w-0">
                            <h3 className="text-sm font-medium text-ink">
                                Already in this list
                            </h3>
                            <p className="mt-1 max-w-prose text-pretty text-xs leading-5 text-sub">
                                These match an application already in this list,
                                so they will not be imported. Select any you
                                want to add anyway.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onKeepAll(!keptAll)}
                            className={`${secondaryButtonClass} shrink-0 max-sm:w-full max-sm:justify-center`}
                        >
                            {keptAll ? "Clear selection" : "Select all"}
                        </button>
                    </div>
                    <div className="mt-4 max-h-64 overflow-y-auto border border-faint sm:max-h-48">
                        <OutcomeHeader detail="Matches" inset />
                        {duplicates.map((row) => (
                            <label
                                key={row.line}
                                className="flex cursor-pointer items-center gap-3 border-b border-faint px-3 py-2 last:border-b-0 hover:bg-surface"
                            >
                                <input
                                    type="checkbox"
                                    checked={keeping.has(row.line)}
                                    onChange={(event) =>
                                        onKeep(row.line, event.target.checked)
                                    }
                                    className={checkboxClass}
                                />
                                <div
                                    className={`${OUTCOME_GRID} min-w-0 flex-1`}
                                >
                                    <OutcomeLine
                                        line={row.line}
                                        company={row.draft.company}
                                        detail={
                                            row.against === "list"
                                                ? existingLabel(row.existing)
                                                : `row ${row.firstLine} of this file`
                                        }
                                    />
                                </div>
                            </label>
                        ))}
                    </div>
                </section>
            )}

            {partial.length > 0 && (
                <Section
                    title="Imported without some values"
                    note="The columns listed could not be read and will be left blank."
                >
                    <div className="max-h-64 overflow-y-auto border border-faint sm:max-h-48">
                        <OutcomeHeader detail="Left empty" />
                        {partial.map((row) => (
                            <div
                                key={row.line}
                                className={`${OUTCOME_GRID} border-b border-faint px-3 py-2 last:border-b-0`}
                            >
                                <OutcomeLine
                                    line={row.line}
                                    company={row.draft.company}
                                    detail={row.dropped
                                        .map(fieldLabel)
                                        .join(", ")}
                                />
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {invalid.length > 0 && (
                <Section
                    title="Skipped"
                    note="These rows cannot be imported. Fix them in your file and import it again."
                >
                    <div className="max-h-64 overflow-y-auto border border-faint sm:max-h-48">
                        <OutcomeHeader detail="Reason" />
                        {invalid.map((row) => (
                            <div
                                key={row.line}
                                className={`${OUTCOME_GRID} border-b border-faint px-3 py-2 last:border-b-0`}
                            >
                                <OutcomeLine
                                    line={row.line}
                                    company={row.company}
                                    detail={row.reason}
                                />
                            </div>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
};

export const ImportDialog = ({
    listId,
    applications,
    defaultCurrency,
    onClose,
}: {
    listId: string;
    applications: ApplicationRow[];
    defaultCurrency: string;
    onClose: () => void;
}) => {
    const { ref: dialogRef, close } = useModalDialog();
    const [step, setStep] = useState<Step>("file");
    const [sheet, setSheet] = useState<Sheet | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    // Only what the user has changed. What the sheet's values match on their own
    // is derived below, so remapping a column re-reads its values rather than
    // leaving the ones it just revealed unanswered.
    const [statusEdits, setStatusEdits] = useState<
        Record<string, ApplicationStatus>
    >({});
    const [arrangementEdits, setArrangementEdits] = useState<
        Record<string, Arrangement | null>
    >({});
    const [fallbackStatus, setFallbackStatus] =
        useState<ApplicationStatus>("applied");
    const [keeping, setKeeping] = useState<ReadonlySet<number>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dismiss = () => close(onClose);

    const listKeys = useMemo(() => existingIndex(applications), [applications]);

    const outcomes = useMemo(
        () =>
            sheet
                ? buildRows(
                      sheet,
                      mapping,
                      {
                          statuses: statusEdits,
                          arrangements: arrangementEdits,
                      },
                      fallbackStatus,
                      listKeys,
                      defaultCurrency,
                  )
                : [],
        [
            sheet,
            mapping,
            statusEdits,
            arrangementEdits,
            fallbackStatus,
            listKeys,
            defaultCurrency,
        ],
    );

    const pickFile = async (file: File) => {
        setBusy(true);
        setError(null);
        try {
            const result = await readImportFile(file);
            if (!result.ok) {
                setError(result.error);
                setBusy(false);
                return;
            }

            setSheet(result.sheet);
            setMapping(matchColumns(result.sheet.headers));
            setStatusEdits({});
            setArrangementEdits({});
            setKeeping(new Set());
            setStep("map");
        } catch {
            setError("Could not read that file. Try again.");
        }
        setBusy(false);
    };

    const remap = (field: string, column: number) => {
        setMapping((current) => {
            const next: ColumnMapping = { ...current };
            // A column can only feed one field, so claiming it takes it off
            // whichever field held it before.
            for (const key of Object.keys(next) as (keyof ColumnMapping)[]) {
                if (next[key] === column) delete next[key];
            }
            if (column === NO_COLUMN) {
                delete next[field as keyof ColumnMapping];
            } else {
                next[field as keyof ColumnMapping] = column;
            }
            return next;
        });
    };

    const drafts = useMemo((): ImportDraft[] => {
        const kept: ImportDraft[] = [];
        for (const outcome of outcomes) {
            if (outcome.kind === "ready") kept.push(outcome.draft);
            else if (
                outcome.kind === "duplicate" &&
                keeping.has(outcome.line)
            ) {
                kept.push(outcome.draft);
            }
        }
        return kept;
    }, [outcomes, keeping]);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            const result = await commitImport(
                listId,
                drafts,
                browserTimeZone(),
            );
            if (result.ok) {
                dismiss();
                return;
            }
            setError(result.error);
        } catch {
            setError("Could not import those applications. Try again.");
        }
        setBusy(false);
    };

    const companyMapped = mapping.company !== undefined;
    const readyCount = drafts.length;

    // A failed save answers the press the user just made, so it takes the line
    // ahead of the standing reason the step cannot be left yet.
    const note =
        error ??
        (step === "map" && !companyMapped
            ? "Choose which column holds the company name."
            : null);

    // `display` stays the browser's to set. A `flex` class on the dialog would
    // outrank the user-agent's `dialog:not([open]) { display: none }` and leave
    // it laid out after it closes, so the layout goes on an inner element, the
    // same way the drawer does it.
    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={TITLE_ID}
            onCancel={(event) => {
                event.preventDefault();
                dismiss();
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) dismiss();
            }}
            className="m-auto max-h-[85vh] w-180 max-w-[calc(100vw-2rem)] border-0 bg-background p-0 shadow-lg backdrop:bg-ink/25"
        >
            <div className="flex max-h-[85vh] flex-col">
                <div className="h-0.75 shrink-0 bg-accent" aria-hidden="true" />
                <header className="shrink-0 border-x border-b border-hairline px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <h2
                                id={TITLE_ID}
                                className="truncate text-sm font-medium text-ink"
                            >
                                Import applications
                            </h2>
                            <p className="mt-0.5 h-4 truncate text-xs text-sub">
                                {step === "file"
                                    ? "Add applications from a CSV or Excel file."
                                    : sheet
                                      ? `${countLabel(sheet.rows.length, "row")} read from your file.`
                                      : ""}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={dismiss}
                            aria-label="Close"
                            title="Close"
                            className="-mr-1 shrink-0 cursor-pointer p-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--x] block size-4"
                            />
                        </button>
                    </div>
                    <div className="mt-3 border-t border-faint pt-3">
                        <Stepper step={step} />
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto border-x border-hairline px-4 py-5 sm:px-5">
                    {step === "file" && (
                        <FileStep busy={busy} onPick={pickFile} />
                    )}
                    {step === "map" && sheet && (
                        <MapStep
                            sheet={sheet}
                            mapping={mapping}
                            statusEdits={statusEdits}
                            arrangementEdits={arrangementEdits}
                            fallbackStatus={fallbackStatus}
                            onMap={remap}
                            onStatus={(value, status) =>
                                setStatusEdits((current) => ({
                                    ...current,
                                    [valueKey(value)]: status,
                                }))
                            }
                            onArrangement={(value, arrangement) =>
                                setArrangementEdits((current) => ({
                                    ...current,
                                    [valueKey(value)]: arrangement,
                                }))
                            }
                            onFallbackStatus={setFallbackStatus}
                        />
                    )}
                    {step === "review" && (
                        <ReviewStep
                            outcomes={outcomes}
                            keeping={keeping}
                            onKeep={(line, keep) =>
                                setKeeping((current) => {
                                    const next = new Set(current);
                                    if (keep) next.add(line);
                                    else next.delete(line);
                                    return next;
                                })
                            }
                            onKeepAll={(keep) =>
                                setKeeping(
                                    keep
                                        ? new Set(
                                              outcomes
                                                  .filter(
                                                      (outcome) =>
                                                          outcome.kind ===
                                                          "duplicate",
                                                  )
                                                  .map(
                                                      (outcome) => outcome.line,
                                                  ),
                                          )
                                        : new Set(),
                                )
                            }
                        />
                    )}
                </div>

                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-x-1 gap-y-2 border-x border-t border-b border-hairline px-4 py-3 sm:px-5">
                    {/* Beside the buttons where there is room for it, on its own
                    line where there is not: a reason clipped to three words is
                    no reason at all. */}
                    {note && (
                        <p
                            className={`min-w-0 truncate text-xs max-sm:w-full sm:mr-auto ${error ? "text-rose" : "text-muted"}`}
                        >
                            {note}
                        </p>
                    )}
                    {step === "review" ? (
                        <button
                            type="button"
                            onClick={() => setStep("map")}
                            className={ghostButtonClass}
                        >
                            Back
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={dismiss}
                            className={ghostButtonClass}
                        >
                            Cancel
                        </button>
                    )}
                    {step === "map" && (
                        <button
                            type="button"
                            onClick={() => setStep("review")}
                            disabled={!companyMapped}
                            className={primaryButtonClass}
                        >
                            Continue
                        </button>
                    )}
                    {step === "review" && (
                        <button
                            type="button"
                            onClick={run}
                            disabled={busy || readyCount === 0}
                            className={primaryButtonClass}
                        >
                            {/* The label holds still while the import runs and
                            the spinner keeps its place either way, so pressing
                            the button cannot resize it and shove the row. */}
                            <span
                                aria-hidden="true"
                                className={`icon-[lucide--loader-circle] mr-1.5 size-3.5 shrink-0 animate-spin ${busy ? "" : "invisible"}`}
                            />
                            Import {countLabel(readyCount, "application")}
                        </button>
                    )}
                </footer>
            </div>
        </dialog>
    );
};
