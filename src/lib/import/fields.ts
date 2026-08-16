// What a spreadsheet column can be mapped onto, and the names other trackers
// give it. The set matches the quick-edit grid's columns rather than every
// column an application holds: a sheet exported from another tracker keeps pay
// as one piece of text, which `parsePay` splits on the way in.

import { containsMatch, searchScore } from "@/lib/fuzzy";

export type ImportField =
    | "company"
    | "role"
    | "status"
    | "location"
    | "arrangement"
    | "pay"
    | "appliedAt"
    | "url"
    | "notes";

export type FieldMeta = {
    key: ImportField;
    label: string;
    // Company is the only column an application cannot be written without, so
    // it is the only one that blocks the import.
    required?: boolean;
    // What the same column is called elsewhere. These capture *meaning*; the
    // fuzzy scorer handles spelling, so misspellings do not belong here.
    aliases: readonly string[];
};

export const IMPORT_FIELDS: readonly FieldMeta[] = [
    {
        key: "company",
        label: "Company",
        required: true,
        aliases: [
            "company",
            "company name",
            "employer",
            "organisation",
            "organization",
            "org",
            "firm",
            "business",
            "workplace",
        ],
    },
    {
        key: "role",
        label: "Role",
        aliases: [
            "role",
            "title",
            "job title",
            "position",
            "job",
            "role title",
            "job role",
            "posting title",
            "opening",
        ],
    },
    {
        key: "status",
        label: "Status",
        aliases: [
            "status",
            "stage",
            "progress",
            "state",
            "outcome",
            "result",
            "application status",
            "current stage",
        ],
    },
    {
        key: "location",
        label: "Location",
        aliases: [
            "location",
            "city",
            "place",
            "office",
            "job location",
            "region",
            "country",
            "based in",
            "where",
        ],
    },
    {
        key: "arrangement",
        label: "Arrangement",
        aliases: [
            "arrangement",
            "work arrangement",
            "work model",
            "work type",
            "workplace type",
            "location type",
            "setting",
            "modality",
            "remote or onsite",
        ],
    },
    {
        key: "pay",
        label: "Pay",
        aliases: [
            "pay",
            "salary",
            "compensation",
            "comp",
            "rate",
            "wage",
            "pay range",
            "salary range",
            "expected salary",
            "base",
        ],
    },
    {
        key: "appliedAt",
        label: "Applied",
        aliases: [
            "applied",
            "applied at",
            "applied on",
            "date applied",
            "application date",
            "apply date",
            "date",
            "submitted",
            "date submitted",
        ],
    },
    {
        key: "url",
        label: "Link",
        aliases: [
            "url",
            "link",
            "posting",
            "job link",
            "job url",
            "posting link",
            "listing",
            "application link",
            "job posting",
        ],
    },
    {
        key: "notes",
        label: "Notes",
        aliases: [
            "notes",
            "note",
            "comments",
            "comment",
            "remarks",
            "details",
            "description",
        ],
    },
];

// A column is only claimed when the header is written into one of the names
// above rather than merely scattered through it. Leaving a doubtful header
// unmapped is the cheaper mistake: an unmapped column is visible in the mapping
// step and one click from being fixed, while a wrongly mapped one is silent.
const confident = (header: string, field: FieldMeta): boolean =>
    [field.label, ...field.aliases].some((name) => containsMatch(header, name));

export type ColumnMapping = Partial<Record<ImportField, number>>;

// Best-first assignment, so the strongest reading of the sheet wins and neither
// a field nor a column is claimed twice. "Comp" reaches Pay rather than Company
// because an exact alias outranks a label prefix.
export const matchColumns = (headers: readonly string[]): ColumnMapping => {
    const pairs: { field: ImportField; column: number; score: number }[] = [];

    IMPORT_FIELDS.forEach((field) => {
        headers.forEach((header, column) => {
            if (!header.trim() || !confident(header, field)) return;
            const score = searchScore(header, field.label, field.aliases);
            if (score > 0) pairs.push({ field: field.key, column, score });
        });
    });

    pairs.sort((first, second) => second.score - first.score);

    const mapping: ColumnMapping = {};
    const takenColumns = new Set<number>();
    for (const pair of pairs) {
        if (mapping[pair.field] !== undefined) continue;
        if (takenColumns.has(pair.column)) continue;
        mapping[pair.field] = pair.column;
        takenColumns.add(pair.column);
    }
    return mapping;
};
