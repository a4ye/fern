import { gzipSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "@neondatabase/serverless";
import { getPool, withTransaction } from "@/db/client";
import {
    PAY_PERIODS,
    STATUS_META,
    arrangementLabel,
    formatRelative,
    payPeriodLabel,
    type ApplicationStatus,
    type Arrangement,
    type PayPeriod,
} from "@/components/dashboard/data";
import {
    HISTORY_APPLICATIONS_PAGE_SIZE,
    HISTORY_CHANGES_PAGE_SIZE,
    HISTORY_CHANGES_PREVIEW_SIZE,
    HISTORY_INITIAL_PAGE_SIZE,
    type HistoryApplicationDetail,
    type HistoryApplicationsPage,
} from "@/lib/history-pagination";

type QueryClient = Pick<PoolClient, "query">;
type Scalar = string | null;
type FieldChange = [before: Scalar, after: Scalar];
type FieldChanges = Record<string, FieldChange>;

export const HISTORY_KIND = {
    create: 1,
    import: 2,
    edit: 3,
    status: 4,
    arrangement: 5,
    delete: 6,
    list: 7,
    steps: 8,
    undo: 9,
    restore: 10,
} as const;

export type HistoryKind = (typeof HISTORY_KIND)[keyof typeof HISTORY_KIND];

type ApplicationSnapshot = {
    id: string;
    listId: string;
    position: number;
    companyName: string;
    roleTitle: string | null;
    status: string;
    url: string | null;
    location: string | null;
    arrangement: string | null;
    notes: string | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: string | null;
    bonusAmount: string | null;
    payNote: string | null;
    appliedAt: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByHistoryActionId: string | null;
};

type ApplicationEventSnapshot = {
    id: string;
    applicationId: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    occurredAt: Date;
    historyActionId: string | null;
};

type ApplicationPatch = {
    i: string;
    n: string;
    f: FieldChanges;
    /** Currency context for amount changes when currency itself did not change. */
    p?: FieldChange;
};

type ListSnapshot = {
    name: string;
    description: string | null;
    status: string;
};

type HistoryReplayData = {
    d?: ReturnType<typeof storedApplication>[];
    e?: ReturnType<typeof storedEvent>[];
};

type HistoryApplicationSummary = {
    i?: string;
    n: string;
    r: string | null;
};

type VersionEventChanges = {
    c?: ReturnType<typeof storedEvent>[];
    d?: ReturnType<typeof storedEvent>[];
};

export type VersionDelta = {
    a?: ApplicationPatch[];
    c?: ReturnType<typeof storedApplication>[];
    d?: ReturnType<typeof storedApplication>[];
    e?: VersionEventChanges;
    f?: FieldChanges;
};

export type StoredApplication = ReturnType<typeof storedApplication>;
export type StoredApplicationEvent = ReturnType<typeof storedEvent>;

export type VersionState = {
    applications: Map<string, StoredApplication>;
    events: Map<string, StoredApplicationEvent>;
    list: ListSnapshot;
};

type HistoryData = {
    a?: ApplicationPatch[];
    d?: ReturnType<typeof storedApplication>[];
    e?: ReturnType<typeof storedEvent>[];
    g?: ReturnType<typeof storedEvent>[];
    f?: FieldChanges;
    m?: HistoryApplicationSummary[];
    n?: string;
    o?: string;
    q?: 0 | 1;
    r?: string;
    t?: string;
    v?: VersionDelta;
    x?: HistoryReplayData;
};

type HistoryDatabaseRow = {
    id: string;
    listId?: string;
    kind: number;
    affectedCount: number;
    data: unknown;
    reversible: boolean;
    occurredAt: Date;
    undoneAt: Date | null;
};

export type StoredHistoryAction = {
    id: string;
    kind: number;
    affectedCount: number;
    data: unknown;
    reversible: boolean;
    occurredAt: string;
    undoneAt: string | null;
};

export type HistoryCategory =
    "added" | "edited" | "moved" | "deleted" | "reverted" | "restored";

export type HistoryRestoreTarget = {
    title: string;
    occurredAt: string;
    day: string;
    time: string;
};

export type HistoryValueToken = {
    field: "status" | "arrangement";
    value: string;
};

export type HistoryValueChange = {
    field: HistoryValueToken["field"];
    subject: string | null;
    before: string | null;
    after: string | null;
    count: number;
};

export type HistoryFieldChange = {
    scope: "application" | "list";
    code: string;
    label: string;
    subject: string | null;
    before: string | null;
    after: string | null;
    count: number;
    currencyBefore?: string | null;
    currencyAfter?: string | null;
};

export type HistoryStatusEntryChange = {
    action: "added" | "removed" | "restored";
    subject: string | null;
    from: string | null;
    to: string | null;
    note: string | null;
};

export type HistorySummaryChange = {
    icon: "applications" | "statusHistory" | "more";
    label: string;
};

export type ListHistoryChange = {
    kind: "applications" | "value" | "field" | "statusEntry" | "summary";
    description: string;
    applications: string[];
    applicationCount: number;
    applicationListLabel?: string;
    applicationDetails?: HistoryApplicationDetail[];
    valueChange?: HistoryValueChange;
    fieldChange?: HistoryFieldChange;
    statusEntryChange?: HistoryStatusEntryChange;
    summaryChange?: HistorySummaryChange;
};

export type ListHistoryItem = {
    id: string;
    title: string;
    titleValue: HistoryValueToken | null;
    changes: ListHistoryChange[];
    changeCount: number;
    category: HistoryCategory;
    occurredAt: string;
    when: string;
    day: string;
    time: string;
    canUndo: boolean;
    canRestore: boolean;
    reversal: "undo" | "redo";
    undone: boolean;
    archived: boolean;
    singleApplication: boolean;
    restoreTarget: HistoryRestoreTarget | null;
};

export type HistoryChangesPage = {
    changes: ListHistoryChange[];
    offset: number;
    total: number;
};

export type ListHistoryPage = {
    items: ListHistoryItem[];
    nextCursor: string | null;
    hasMore: boolean;
};

type HistoryChangeDetailsOptions = {
    applicationOffset?: number;
    applicationLimit?: number;
};

const MAX_ID = "9223372036854775807";
export const HISTORY_LOAD_PAGE_SIZE = 20;
const ARCHIVE_READ_LIMIT = 3;
const AUTOMATIC_ARCHIVE_INTERVAL = BigInt(128);
const AUTOMATIC_ARCHIVE_SLOTS = BigInt(4);
const DAYS_TO_KEEP_HOT = 90;
const ACTIONS_TO_KEEP_HOT_PER_LIST = 100;
const MINIMUM_ARCHIVE_ACTIONS = 100;
const ACTIONS_PER_CHUNK = 500;

const FIELD_MAP = {
    c: "companyName",
    r: "roleTitle",
    s: "status",
    u: "url",
    l: "location",
    a: "arrangement",
    n: "notes",
    mi: "payMin",
    ma: "payMax",
    cu: "payCurrency",
    pe: "payPeriod",
    b: "bonusAmount",
    pn: "payNote",
    d: "appliedAt",
} as const satisfies Record<string, keyof ApplicationSnapshot>;

const STORED_FIELD_MAP = {
    c: "company_name",
    r: "role_title",
    s: "status",
    u: "url",
    l: "location",
    a: "arrangement",
    n: "notes",
    mi: "pay_min",
    ma: "pay_max",
    cu: "pay_currency",
    pe: "pay_period",
    b: "bonus_amount",
    pn: "pay_note",
    d: "applied_at",
} as const satisfies Record<keyof typeof FIELD_MAP, keyof StoredApplication>;

const FIELD_LABELS: Record<keyof typeof FIELD_MAP, string> = {
    c: "Company",
    r: "Role",
    s: "Status",
    u: "Link",
    l: "Location",
    a: "Arrangement",
    n: "Notes",
    mi: "Minimum pay",
    ma: "Maximum pay",
    cu: "Currency",
    pe: "Pay period",
    b: "Bonus",
    pn: "Pay note",
    d: "Applied date",
};

const rowsOf = async <Row>(
    client: QueryClient,
    text: string,
    values: unknown[],
): Promise<Row[]> => {
    const result = await client.query({ text, values });
    return result.rows as Row[];
};

const reserveActionId = async (client: QueryClient): Promise<string> => {
    const [row] = await rowsOf<{ id: string }>(
        client,
        "select nextval('list_history_action_id_seq')::bigint as id",
        [],
    );
    if (!row) throw new Error("Could not reserve a history action ID.");
    return String(row.id);
};

const insertAction = async (
    client: QueryClient,
    input: {
        id: string;
        userId: string;
        listId: string;
        kind: HistoryKind;
        affectedCount: number;
        data: HistoryData;
        reversible?: boolean;
    },
): Promise<void> => {
    await client.query({
        text: `
            insert into list_history_actions (
                id, list_id, kind, affected_count, data, reversible
            )
            select $1::bigint, l.id, $2::smallint, $3::int, $4::jsonb, $5
            from lists l
            where l.id = $6 and l.user_id = $7
        `,
        values: [
            input.id,
            input.kind,
            input.affectedCount,
            JSON.stringify(input.data),
            input.reversible ?? true,
            input.listId,
            input.userId,
        ],
    });
};

const applicationSnapshots = async (
    client: QueryClient,
    userId: string,
    applicationIds: string[],
): Promise<ApplicationSnapshot[]> => {
    if (applicationIds.length === 0) return [];
    return rowsOf<ApplicationSnapshot>(
        client,
        `
            select
                a.id,
                a.list_id as "listId",
                a.position,
                a.company_name as "companyName",
                a.role_title as "roleTitle",
                a.status,
                a.url,
                a.location,
                a.arrangement,
                a.notes,
                a.pay_min::text as "payMin",
                a.pay_max::text as "payMax",
                trim(a.pay_currency::text) as "payCurrency",
                a.pay_period as "payPeriod",
                a.bonus_amount::text as "bonusAmount",
                a.pay_note as "payNote",
                to_char(a.applied_at, 'YYYY-MM-DD') as "appliedAt",
                a.created_at as "createdAt",
                a.updated_at as "updatedAt",
                a.created_by_history_action_id::text
                    as "createdByHistoryActionId"
            from applications a
            join lists l on l.id = a.list_id
            where a.id = any($1::uuid[]) and l.user_id = $2
            order by a.id
            for update of a
        `,
        [applicationIds, userId],
    );
};

const applicationEvents = async (
    client: QueryClient,
    userId: string,
    applicationIds: string[],
): Promise<ApplicationEventSnapshot[]> => {
    if (applicationIds.length === 0) return [];
    return rowsOf<ApplicationEventSnapshot>(
        client,
        `
            select
                e.id,
                e.application_id as "applicationId",
                e.from_status as "fromStatus",
                e.to_status as "toStatus",
                e.note,
                e.occurred_at as "occurredAt",
                e.history_action_id::text as "historyActionId"
            from application_events e
            join applications a on a.id = e.application_id
            join lists l on l.id = a.list_id
            where e.application_id = any($1::uuid[])
                and l.user_id = $2
            order by e.application_id, e.occurred_at, e.id
        `,
        [applicationIds, userId],
    );
};

const applicationsCreatedByAction = async (
    client: QueryClient,
    userId: string,
    listId: string,
    actionId: string,
): Promise<ApplicationSnapshot[]> => {
    const ids = await rowsOf<{ id: string }>(
        client,
        `
            select a.id::text as id
            from applications a
            join lists l on l.id = a.list_id
            where a.list_id = $1
                and l.user_id = $2
                and a.created_by_history_action_id = $3::bigint
            order by a.id
        `,
        [listId, userId, actionId],
    );
    return applicationSnapshots(
        client,
        userId,
        ids.map((row) => row.id),
    );
};

const listSnapshot = async (
    client: QueryClient,
    userId: string,
    listId: string,
): Promise<ListSnapshot | null> => {
    const [row] = await rowsOf<ListSnapshot>(
        client,
        `
            select l.name, l.description, l.status
            from lists l
            where l.id = $1 and l.user_id = $2
            for update of l
        `,
        [listId, userId],
    );
    return row ?? null;
};

const valueOf = (
    snapshot: ApplicationSnapshot,
    code: keyof typeof FIELD_MAP,
): Scalar => {
    const value = snapshot[FIELD_MAP[code]];
    return value === null ? null : String(value);
};

const changesBetween = (
    before: ApplicationSnapshot[],
    after: ApplicationSnapshot[],
): ApplicationPatch[] => {
    const oldById = new Map(before.map((row) => [row.id, row]));
    return after.flatMap((row) => {
        const old = oldById.get(row.id);
        if (!old) return [];
        const fields: FieldChanges = {};
        for (const code of Object.keys(
            FIELD_MAP,
        ) as (keyof typeof FIELD_MAP)[]) {
            const from = valueOf(old, code);
            const to = valueOf(row, code);
            if (from !== to) fields[code] = [from, to];
        }
        const amountChanged = ["mi", "ma", "b"].some((code) => code in fields);
        return Object.keys(fields).length > 0
            ? [
                  {
                      i: row.id,
                      n: old.companyName,
                      f: fields,
                      ...(amountChanged && !("cu" in fields)
                          ? {
                                p: [
                                    old.payCurrency,
                                    row.payCurrency,
                                ] as FieldChange,
                            }
                          : {}),
                  },
              ]
            : [];
    });
};

const storedApplication = (row: ApplicationSnapshot) => ({
    id: row.id,
    position: row.position,
    company_name: row.companyName,
    role_title: row.roleTitle,
    status: row.status,
    url: row.url,
    location: row.location,
    arrangement: row.arrangement,
    notes: row.notes,
    pay_min: row.payMin,
    pay_max: row.payMax,
    pay_currency: row.payCurrency,
    pay_period: row.payPeriod,
    bonus_amount: row.bonusAmount,
    pay_note: row.payNote,
    applied_at: row.appliedAt,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    created_by_history_action_id: row.createdByHistoryActionId,
});

const storedEvent = (row: ApplicationEventSnapshot) => ({
    id: row.id,
    application_id: row.applicationId,
    from_status: row.fromStatus,
    to_status: row.toStatus,
    note: row.note,
    occurred_at: row.occurredAt.toISOString(),
    history_action_id: row.historyActionId,
});

const currentVersionState = async (
    client: QueryClient,
    userId: string,
    listId: string,
): Promise<VersionState | null> => {
    // Locking the list serializes this restore with application writes because
    // every application mutation touches lists.updated_at in its trigger.
    const list = await listSnapshot(client, userId, listId);
    if (!list) return null;

    const ids = await rowsOf<{ id: string }>(
        client,
        `
            select a.id::text as id
            from applications a
            where a.list_id = $1
            order by a.id
        `,
        [listId],
    );
    const applications = await applicationSnapshots(
        client,
        userId,
        ids.map((row) => row.id),
    );
    const events = await applicationEvents(
        client,
        userId,
        ids.map((row) => row.id),
    );
    return {
        list,
        applications: new Map(
            applications.map((application) => [
                application.id,
                storedApplication(application),
            ]),
        ),
        events: new Map(events.map((event) => [event.id, storedEvent(event)])),
    };
};

// History maintains itself without a cron job. Four action IDs out of every
// 128 check for one eligible chunk after the user's transaction has committed.
// That is enough capacity to drain a backlog while adding no maintenance query
// to the other 97% of writes. A failed maintenance pass never turns a completed
// user edit into an apparent failure; a later slot simply tries again.
export const historyActionRunsMaintenance = (actionId: string): boolean =>
    BigInt(actionId) % AUTOMATIC_ARCHIVE_INTERVAL < AUTOMATIC_ARCHIVE_SLOTS;

export const maintainHistoryAfterAction = async (
    actionId: string | null,
): Promise<void> => {
    if (actionId === null || !historyActionRunsMaintenance(actionId)) {
        return;
    }

    try {
        await archiveNextHistoryChunk({
            before: new Date(
                Date.now() - DAYS_TO_KEEP_HOT * 24 * 60 * 60 * 1_000,
            ),
            keepRecent: ACTIONS_TO_KEEP_HOT_PER_LIST,
            minimumActions: MINIMUM_ARCHIVE_ACTIONS,
            batchSize: ACTIONS_PER_CHUNK,
        });
    } catch {
        // Archiving is opportunistic. The next maintenance slot retries.
    }
};

export const recordCreatedApplications = async <Result>(input: {
    userId: string;
    listId: string;
    kind: typeof HISTORY_KIND.create | typeof HISTORY_KIND.import;
    name?: string;
    mutation: (
        client: QueryClient,
        actionId: string,
    ) => Promise<{ result: Result; affectedCount: number }>;
}): Promise<Result> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction(async (client) => {
        const id = await reserveActionId(client);
        const changed = await input.mutation(client, id);
        if (changed.affectedCount > 0) {
            const created = await applicationsCreatedByAction(
                client,
                input.userId,
                input.listId,
                id,
            );
            await insertAction(client, {
                id,
                userId: input.userId,
                listId: input.listId,
                kind: input.kind,
                affectedCount: changed.affectedCount,
                data: {
                    ...(input.name ? { n: input.name } : {}),
                    ...(created.length > 0
                        ? {
                              m: created.map((application) => ({
                                  n: application.companyName,
                                  r: application.roleTitle,
                              })),
                          }
                        : {}),
                },
            });
            recordedActionId = id;
        }
        return changed.result;
    });
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

type ApplicationChangeInput<Result> = {
    userId: string;
    applicationIds: string[];
    kind:
        | typeof HISTORY_KIND.edit
        | typeof HISTORY_KIND.status
        | typeof HISTORY_KIND.arrangement
        | typeof HISTORY_KIND.steps;
    trackRemovedEvents?: boolean;
    mutation: (client: QueryClient, actionId: string) => Promise<Result>;
    onRecorded?: (actionId: string) => void;
};

export const recordApplicationChangeWithClient = async <Result>(
    client: QueryClient,
    input: ApplicationChangeInput<Result>,
): Promise<Result> => {
    const id = await reserveActionId(client);
    const before = await applicationSnapshots(
        client,
        input.userId,
        input.applicationIds,
    );
    const eventsBefore = input.trackRemovedEvents
        ? await applicationEvents(client, input.userId, input.applicationIds)
        : [];
    const result = await input.mutation(client, id);
    const after = await applicationSnapshots(
        client,
        input.userId,
        input.applicationIds,
    );
    const patches = changesBetween(before, after);

    const eventsAfter =
        input.trackRemovedEvents || input.kind === HISTORY_KIND.steps
            ? await applicationEvents(
                  client,
                  input.userId,
                  input.applicationIds,
              )
            : [];
    let removed: ReturnType<typeof storedEvent>[] = [];
    if (input.trackRemovedEvents) {
        const remaining = new Set(eventsAfter.map((event) => event.id));
        removed = eventsBefore
            .filter((event) => !remaining.has(event.id))
            .map(storedEvent);
    }
    const added =
        input.kind === HISTORY_KIND.steps
            ? eventsAfter
                  .filter((event) => event.historyActionId === id)
                  .map(storedEvent)
            : [];

    if (patches.length > 0 || removed.length > 0 || added.length > 0) {
        const listId = before[0]?.listId ?? after[0]?.listId;
        if (listId) {
            await insertAction(client, {
                id,
                userId: input.userId,
                listId,
                kind: input.kind,
                affectedCount: Math.max(
                    patches.length,
                    before.length,
                    after.length,
                ),
                data: {
                    ...(patches.length > 0 ? { a: patches } : {}),
                    ...(removed.length > 0 ? { e: removed } : {}),
                    ...(added.length > 0 ? { g: added } : {}),
                    ...(input.kind === HISTORY_KIND.steps &&
                    (before[0] ?? after[0])
                        ? { n: (before[0] ?? after[0]).companyName }
                        : {}),
                },
            });
            input.onRecorded?.(id);
        }
    }
    return result;
};

export const recordApplicationChange = async <Result>(
    input: ApplicationChangeInput<Result>,
): Promise<Result> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction((client) =>
        recordApplicationChangeWithClient(client, {
            ...input,
            onRecorded: (actionId) => {
                recordedActionId = actionId;
            },
        }),
    );
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

export const recordDeletedApplications = async <Result>(input: {
    userId: string;
    applicationIds: string[];
    mutation: (client: QueryClient) => Promise<Result>;
}): Promise<Result> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction(async (client) => {
        const before = await applicationSnapshots(
            client,
            input.userId,
            input.applicationIds,
        );
        const events = await applicationEvents(
            client,
            input.userId,
            input.applicationIds,
        );
        const result = await input.mutation(client);
        if (before.length > 0) {
            const id = await reserveActionId(client);
            await insertAction(client, {
                id,
                userId: input.userId,
                listId: before[0].listId,
                kind: HISTORY_KIND.delete,
                affectedCount: before.length,
                data: {
                    d: before.map(storedApplication),
                    ...(events.length > 0
                        ? { e: events.map(storedEvent) }
                        : {}),
                },
            });
            recordedActionId = id;
        }
        return result;
    });
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

export const recordListChange = async <Result>(input: {
    userId: string;
    listId: string;
    mutation: (client: QueryClient) => Promise<Result>;
}): Promise<Result> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction(async (client) => {
        const before = await listSnapshot(client, input.userId, input.listId);
        const result = await input.mutation(client);
        const after = await listSnapshot(client, input.userId, input.listId);
        if (before && after) {
            const fields: FieldChanges = {};
            if (before.name !== after.name) {
                fields.n = [before.name, after.name];
            }
            if (before.description !== after.description) {
                fields.d = [before.description, after.description];
            }
            if (before.status !== after.status) {
                fields.s = [before.status, after.status];
            }
            if (Object.keys(fields).length > 0) {
                const id = await reserveActionId(client);
                await insertAction(client, {
                    id,
                    userId: input.userId,
                    listId: input.listId,
                    kind: HISTORY_KIND.list,
                    affectedCount: 1,
                    data: { f: fields },
                });
                recordedActionId = id;
            }
        }
        return result;
    });
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

const asData = (value: unknown): HistoryData =>
    value && typeof value === "object" ? (value as HistoryData) : {};

const asPatch = (value: unknown): ApplicationPatch[] => {
    const patches = asData(value).a;
    return Array.isArray(patches) ? patches : [];
};

const displayValue = (code: string, value: Scalar): string => {
    if (value === null || value === "") return "Not set";
    if (code === "s" && value in STATUS_META) {
        return STATUS_META[value as ApplicationStatus].label;
    }
    if (code === "a" && ["remote", "hybrid", "onsite"].includes(value)) {
        return arrangementLabel(value as Arrangement);
    }
    if (code === "pe" && PAY_PERIODS.includes(value as PayPeriod)) {
        return payPeriodLabel(value as PayPeriod);
    }
    const oneLine = value.replace(/\s+/g, " ");
    return oneLine.length > 100 ? `${oneLine.slice(0, 97)}...` : oneLine;
};

const applicationTitle = (
    company: string | undefined,
    role: string | null | undefined,
): string | null => {
    if (!company) return null;
    return role ? `${role} at ${company}` : company;
};

const restoredTitle = (original: string | undefined): string => {
    if (!original) return "Restored a previous change";
    if (
        original === "Restored an earlier version" ||
        original === "Restored the list to an earlier point" ||
        original === "Restored an earlier version of the list"
    ) {
        return "Restored the previous version of the list";
    }

    const edited = /^Edited (.+)$/.exec(original)?.[1];
    if (edited === "list details") return "Restored previous list details";
    if (edited === "status history") {
        return "Restored previous status history";
    }
    if (edited?.endsWith("'s status history")) {
        return `Restored previous status history for ${edited.slice(0, -17)}`;
    }
    if (edited) return `Restored previous details for ${edited}`;

    const updatedDetails = /^Updated details for (.+)$/.exec(original)?.[1];
    if (updatedDetails) {
        return `Restored previous details for ${updatedDetails}`;
    }

    const updated = /^Updated (.+)$/.exec(original)?.[1];
    if (updated === "list details") return "Restored previous list details";
    if (updated) return `Restored previous details for ${updated}`;

    const timeline = /^Changed the timeline for (.+)$/.exec(original)?.[1];
    if (timeline) return `Restored previous status history for ${timeline}`;

    const statusHistory = /^Changed status history for (.+)$/.exec(
        original,
    )?.[1];
    if (statusHistory) {
        return `Restored previous status history for ${statusHistory}`;
    }

    const changedStatus = /^Changed the status of (.+)$/.exec(original)?.[1];
    if (changedStatus) {
        return `Restored the previous status of ${changedStatus}`;
    }

    const added = /^Added (.+)$/.exec(original)?.[1];
    if (added) return `Removed ${added}`;

    const imported = /^Imported (.+) (applications?)$/.exec(original);
    if (imported) return `Removed ${imported[1]} imported ${imported[2]}`;

    const moved = /^Moved (.+) to .+$/.exec(original)?.[1];
    if (moved) return `Restored previous status for ${moved}`;

    const arranged = /^Set (.+) to .+$/.exec(original)?.[1];
    if (arranged) return `Restored previous work arrangement for ${arranged}`;

    const namedArrangement =
        /^Set (.+)'s work arrangement to .+$/.exec(original)?.[1] ??
        /^Set the work arrangement for (.+) to .+$/.exec(original)?.[1] ??
        /^Cleared the work arrangement for (.+)$/.exec(original)?.[1] ??
        /^Changed the work arrangement of (.+)$/.exec(original)?.[1];
    if (namedArrangement) {
        return `Restored the previous work arrangement for ${namedArrangement}`;
    }

    const deleted = /^Deleted (.+)$/.exec(original)?.[1];
    if (deleted) return `Restored ${deleted}`;

    return "Restored a previous change";
};

const reappliedTitle = (original: string | undefined): string => {
    if (!original) return "Redid a previous change";
    if (
        original === "Restored an earlier version" ||
        original === "Restored the list to an earlier point" ||
        original === "Restored an earlier version of the list"
    ) {
        return "Restored the earlier version of the list";
    }

    const edited = /^Edited (.+)$/.exec(original)?.[1];
    if (edited === "list details") return "Updated list details";
    if (edited === "status history")
        return "Changed application status history";
    if (edited?.endsWith("'s status history")) {
        return `Changed status history for ${edited.slice(0, -17)}`;
    }
    if (edited) return `Updated ${edited}`;

    const updatedDetails = /^Updated details for (.+)$/.exec(original)?.[1];
    if (updatedDetails) return `Updated details for ${updatedDetails}`;

    const updated = /^Updated (.+)$/.exec(original)?.[1];
    if (updated) return `Updated ${updated}`;

    const timeline = /^Changed the timeline for (.+)$/.exec(original)?.[1];
    if (timeline) return `Changed status history for ${timeline}`;

    const statusHistory = /^Changed status history for (.+)$/.exec(
        original,
    )?.[1];
    if (statusHistory) {
        return `Changed status history for ${statusHistory}`;
    }

    const changedStatus = /^Changed the status of (.+)$/.exec(original)?.[1];
    if (changedStatus) return `Changed the status of ${changedStatus}`;

    const imported = /^Imported (.+) (applications?)$/.exec(original);
    if (imported) return `Restored ${imported[1]} imported ${imported[2]}`;

    if (
        /^(Added|Moved|Set|Cleared|Changed the work arrangement|Deleted) /.test(
            original,
        )
    )
        return original;
    return "Redid a previous change";
};

export const historyTitleFor = (row: StoredHistoryAction): string => {
    const data = asData(row.data);
    const patches = asPatch(row.data);
    const count = row.affectedCount;
    const noun = count === 1 ? "application" : "applications";
    const firstName = patches[0]?.n ?? data.n;
    switch (row.kind) {
        case HISTORY_KIND.create: {
            const created =
                data.m?.length === 1
                    ? applicationTitle(data.m[0].n, data.m[0].r)
                    : data.d?.length === 1
                      ? applicationTitle(
                            data.d[0].company_name,
                            data.d[0].role_title,
                        )
                      : firstName;
            return created ? `Added ${created}` : "Added an application";
        }
        case HISTORY_KIND.import:
            return `Imported ${count.toLocaleString()} ${noun}`;
        case HISTORY_KIND.edit:
            return count === 1 && firstName
                ? `Updated ${firstName}`
                : `Updated details for ${count.toLocaleString()} ${noun}`;
        case HISTORY_KIND.status: {
            const statuses = new Set(
                patches.flatMap((patch) => (patch.f.s ? [patch.f.s[1]] : [])),
            );
            if (statuses.size > 1) {
                return `Changed the status of ${count.toLocaleString()} ${noun}`;
            }
            const [status] = statuses;
            const destination = status
                ? displayValue("s", status)
                : "a new status";
            return count === 1 && firstName
                ? `Moved ${firstName} to ${destination}`
                : `Moved ${count.toLocaleString()} ${noun} to ${destination}`;
        }
        case HISTORY_KIND.arrangement: {
            const arrangements = new Set(
                patches.flatMap((patch) => (patch.f.a ? [patch.f.a[1]] : [])),
            );
            if (arrangements.size > 1) {
                return `Changed the work arrangement of ${count.toLocaleString()} ${noun}`;
            }
            const [arrangement = null] = arrangements;
            const destination = displayValue("a", arrangement);
            if (arrangement === null) {
                return count === 1 && firstName
                    ? `Cleared the work arrangement for ${firstName}`
                    : `Cleared the work arrangement for ${count.toLocaleString()} ${noun}`;
            }
            return count === 1 && firstName
                ? `Set the work arrangement for ${firstName} to ${destination}`
                : `Set the work arrangement for ${count.toLocaleString()} ${noun} to ${destination}`;
        }
        case HISTORY_KIND.delete: {
            const deleted = data.d?.[0];
            const name = applicationTitle(
                deleted?.company_name,
                deleted?.role_title,
            );
            return count === 1 && name
                ? `Deleted ${name}`
                : `Deleted ${count.toLocaleString()} ${noun}`;
        }
        case HISTORY_KIND.list:
            return "Updated list details";
        case HISTORY_KIND.steps:
            return firstName
                ? `Changed status history for ${firstName}`
                : "Changed application status history";
        case HISTORY_KIND.undo:
            return data.q === 1
                ? reappliedTitle(data.n)
                : restoredTitle(data.n);
        case HISTORY_KIND.restore:
            return "Restored an earlier version of the list";
        default:
            return "Changed this list";
    }
};

const changeDescription = (
    subject: string | null,
    label: string,
    code: string,
    values: FieldChange,
): string => {
    const [before, after] = values;
    const prefix = subject ? `${subject}: ` : "";
    if (before === null || before === "") {
        return `${prefix}${label} set to ${displayValue(code, after)}`;
    }
    if (after === null || after === "") return `${prefix}${label} cleared`;
    return `${prefix}${label} changed from ${displayValue(code, before)} to ${displayValue(code, after)}`;
};

const valueChangeFor = (
    code: string,
    subject: string | null,
    values: FieldChange,
    count: number,
): HistoryValueChange | undefined => {
    const field = code === "s" ? "status" : code === "a" ? "arrangement" : null;
    if (!field) return undefined;
    return {
        field,
        subject,
        before: values[0],
        after: values[1],
        count,
    };
};

const fieldChangeFor = (
    code: string,
    label: string,
    subject: string | null,
    values: FieldChange,
    count: number,
    currency?: FieldChange,
): HistoryFieldChange | undefined => {
    if (code === "s" || code === "a") return undefined;
    return {
        scope: "application",
        code,
        label,
        subject,
        before: values[0],
        after: values[1],
        count,
        ...(currency
            ? {
                  currencyBefore: currency[0],
                  currencyAfter: currency[1],
              }
            : {}),
    };
};

const LIST_FIELD_LABELS: Record<string, string> = {
    n: "Name",
    d: "Description",
    s: "Status",
};

const listValue = (code: string, value: Scalar): string => {
    if (value === null || value === "") return "Not set";
    if (code === "s") {
        return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return displayValue(code, value);
};

const listChangeDescription = (code: string, values: FieldChange): string => {
    const [before, after] = values;
    const label = LIST_FIELD_LABELS[code] ?? code;
    if (before === null || before === "") {
        return `${label} set to ${listValue(code, after)}`;
    }
    if (after === null || after === "") return `${label} cleared`;
    return `${label} changed from ${listValue(code, before)} to ${listValue(code, after)}`;
};

const listFieldChanges = (
    fields: FieldChanges,
    direction: 0 | 1,
): ListHistoryChange[] =>
    Object.entries(fields)
        .sort(
            ([left], [right]) =>
                ["n", "d", "s"].indexOf(left) - ["n", "d", "s"].indexOf(right),
        )
        .map(([code, values]) => {
            const directed: FieldChange =
                direction === 1 ? values : [values[1], values[0]];
            return {
                kind: "field",
                description: listChangeDescription(code, directed),
                applications: [],
                applicationCount: 0,
                fieldChange: {
                    scope: "list",
                    code,
                    label: LIST_FIELD_LABELS[code] ?? code,
                    subject: null,
                    before: directed[0],
                    after: directed[1],
                    count: 1,
                },
            };
        });

const statusEntryChanges = (
    events: ReturnType<typeof storedEvent>[],
    action: HistoryStatusEntryChange["action"],
    subject: string | null,
): ListHistoryChange[] =>
    events.map((event) => {
        const destination = displayValue("s", event.to_status);
        const description =
            action === "added"
                ? `Added ${destination} to status history`
                : action === "removed"
                  ? `Removed ${destination} from status history`
                  : `Restored ${destination} in status history`;
        return {
            kind: "statusEntry",
            description,
            applications: [],
            applicationCount: 0,
            statusEntryChange: {
                action,
                subject,
                from: event.from_status,
                to: event.to_status,
                note: event.note,
            },
        };
    });

const applicationNames = (names: string[]): string | null => {
    const unique = [...new Set(names)];
    if (unique.length === 0) return null;
    const shown = unique.slice(0, 10);
    const remaining = unique.length - shown.length;
    return `Applications: ${shown.join(", ")}${remaining > 0 ? `, and ${remaining.toLocaleString()} more` : ""}`;
};

type ChangeGroup = {
    code: string;
    label: string;
    values: FieldChange;
    currency?: FieldChange;
    names: string[];
};

const HISTORY_FIELD_ORDER = new Map(
    Object.keys(FIELD_MAP).map((code, index) => [code, index]),
);
const HISTORY_STATUS_ORDER = new Map(
    Object.keys(STATUS_META).map((status, index) => [status, index]),
);
const HISTORY_ARRANGEMENT_ORDER = new Map(
    ["remote", "hybrid", "onsite"].map((arrangement, index) => [
        arrangement,
        index,
    ]),
);

const orderedValue = (order: Map<string, number>, value: Scalar): number =>
    order.get(value ?? "") ?? Number.MAX_SAFE_INTEGER;

const compareChangeGroups = (
    left: ChangeGroup,
    right: ChangeGroup,
    direction: 0 | 1,
    countFor: (group: ChangeGroup) => number,
): number => {
    const leftSubject = countFor(left) === 1 ? (left.names[0] ?? null) : null;
    const rightSubject =
        countFor(right) === 1 ? (right.names[0] ?? null) : null;

    if (leftSubject && rightSubject) {
        const subjectDifference = leftSubject.localeCompare(rightSubject);
        if (subjectDifference !== 0) return subjectDifference;
    } else if (leftSubject !== rightSubject) {
        return leftSubject ? -1 : 1;
    }

    const fieldDifference =
        (HISTORY_FIELD_ORDER.get(left.code) ?? Number.MAX_SAFE_INTEGER) -
        (HISTORY_FIELD_ORDER.get(right.code) ?? Number.MAX_SAFE_INTEGER);
    if (fieldDifference !== 0) return fieldDifference;

    const leftValues =
        direction === 1 ? left.values : [left.values[1], left.values[0]];
    const rightValues =
        direction === 1 ? right.values : [right.values[1], right.values[0]];
    const valueOrder =
        left.code === "s"
            ? HISTORY_STATUS_ORDER
            : left.code === "a"
              ? HISTORY_ARRANGEMENT_ORDER
              : null;
    if (valueOrder) {
        const beforeDifference =
            orderedValue(valueOrder, leftValues[0]) -
            orderedValue(valueOrder, rightValues[0]);
        if (beforeDifference !== 0) return beforeDifference;
        return (
            orderedValue(valueOrder, leftValues[1]) -
            orderedValue(valueOrder, rightValues[1])
        );
    }

    return `${leftValues[0] ?? ""}\u0000${leftValues[1] ?? ""}`.localeCompare(
        `${rightValues[0] ?? ""}\u0000${rightValues[1] ?? ""}`,
    );
};

const applicationPage = <Application>(
    applications: Application[],
    options: HistoryChangeDetailsOptions,
): Application[] => {
    const offset = Math.max(0, Math.trunc(options.applicationOffset ?? 0));
    const limit = Math.max(
        1,
        Math.trunc(options.applicationLimit ?? HISTORY_APPLICATIONS_PAGE_SIZE),
    );
    return applications.slice(offset, offset + limit);
};

const amountCurrencyFor = (
    patch: ApplicationPatch,
    code: string,
): FieldChange | undefined =>
    ["mi", "ma", "b"].includes(code) ? (patch.p ?? patch.f.cu) : undefined;

const groupedPatchChanges = (
    row: StoredHistoryAction,
    patches: ApplicationPatch[],
    direction: 0 | 1,
    options: HistoryChangeDetailsOptions,
): ListHistoryChange[] => {
    const directed = (values: FieldChange): FieldChange =>
        direction === 1 ? values : [values[1], values[0]];

    if (row.affectedCount === 1 && patches.length === 1) {
        return Object.entries(patches[0].f)
            .sort(
                ([left], [right]) =>
                    (HISTORY_FIELD_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
                    (HISTORY_FIELD_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER),
            )
            .map(([code, values]) => {
                const directedValues = directed(values);
                const currency = amountCurrencyFor(patches[0], code);
                const directedCurrency = currency
                    ? directed(currency)
                    : undefined;
                const label =
                    FIELD_LABELS[code as keyof typeof FIELD_MAP] ?? code;
                const valueChange = valueChangeFor(
                    code,
                    patches[0].n,
                    directedValues,
                    1,
                );
                const fieldChange = fieldChangeFor(
                    code,
                    label,
                    patches[0].n,
                    directedValues,
                    1,
                    directedCurrency,
                );
                return {
                    kind: valueChange ? "value" : "field",
                    description: changeDescription(
                        patches[0].n,
                        label,
                        code,
                        directedValues,
                    ),
                    applications: [],
                    applicationCount: 0,
                    ...(valueChange ? { valueChange } : {}),
                    ...(fieldChange ? { fieldChange } : {}),
                };
            });
    }

    const groups = new Map<string, ChangeGroup>();
    for (const patch of patches) {
        for (const [code, values] of Object.entries(patch.f)) {
            const currency = amountCurrencyFor(patch, code);
            const key = `${code}:${JSON.stringify(values)}:${JSON.stringify(currency)}`;
            const group = groups.get(key) ?? {
                code,
                label: FIELD_LABELS[code as keyof typeof FIELD_MAP] ?? code,
                values,
                ...(currency ? { currency } : {}),
                names: [],
            };
            group.names.push(patch.n);
            groups.set(key, group);
        }
    }

    const countFor = (group: ChangeGroup): number =>
        patches.length === 1 && row.affectedCount > 1
            ? row.affectedCount
            : group.names.length;
    const entries = [...groups.values()].sort((left, right) =>
        compareChangeGroups(left, right, direction, countFor),
    );
    return entries.map((group) => {
        const recorded = group.names.length;
        const count = countFor(group);
        const directedValues = directed(group.values);
        const directedCurrency = group.currency
            ? directed(group.currency)
            : undefined;
        const valueChange = valueChangeFor(
            group.code,
            count === 1 ? (group.names[0] ?? null) : null,
            directedValues,
            count,
        );
        const fieldChange = fieldChangeFor(
            group.code,
            group.label,
            count === 1 ? (group.names[0] ?? null) : null,
            directedValues,
            count,
            directedCurrency,
        );
        if (count === 1) {
            return {
                kind: valueChange ? "value" : "field",
                description: changeDescription(
                    group.names[0] ?? null,
                    group.label,
                    group.code,
                    directedValues,
                ),
                applications: [],
                applicationCount: 0,
                ...(valueChange ? { valueChange } : {}),
                ...(fieldChange ? { fieldChange } : {}),
            };
        }
        return {
            kind: valueChange ? "value" : "field",
            description: `${changeDescription(null, group.label, group.code, directedValues)} for ${count.toLocaleString()} applications`,
            applications:
                recorded === count ? applicationPage(group.names, options) : [],
            applicationCount: recorded === count ? count : 0,
            ...(valueChange ? { valueChange } : {}),
            ...(fieldChange ? { fieldChange } : {}),
        };
    });
};

export const historyChangeDetailsFor = (
    row: StoredHistoryAction,
    direction: 0 | 1 = 1,
    options: HistoryChangeDetailsOptions = {},
): ListHistoryChange[] => {
    if (row.kind === HISTORY_KIND.undo) return [];
    const data = asData(row.data);
    const patches = asPatch(row.data);
    const lines = groupedPatchChanges(row, patches, direction, options);
    if (data.f) {
        lines.push(...listFieldChanges(data.f, direction));
    }
    if (data.e?.length && row.kind !== HISTORY_KIND.delete) {
        lines.push(
            ...statusEntryChanges(
                data.e,
                direction === 1 ? "removed" : "restored",
                data.n ?? patches[0]?.n ?? null,
            ),
        );
    }
    if (data.g?.length) {
        lines.push(
            ...statusEntryChanges(
                data.g,
                direction === 1 ? "added" : "removed",
                data.n ?? patches[0]?.n ?? null,
            ),
        );
    }
    if (
        row.kind === HISTORY_KIND.create ||
        row.kind === HISTORY_KIND.import ||
        row.kind === HISTORY_KIND.delete
    ) {
        const applicationDetails =
            data.m?.map(
                (application) =>
                    applicationTitle(application.n, application.r) ??
                    application.n,
            ) ??
            data.d?.map((application) =>
                application.role_title
                    ? `${application.company_name} (${application.role_title})`
                    : application.company_name,
            ) ??
            [];
        const uniqueApplications = [...new Set(applicationDetails)];
        const names = applicationNames(uniqueApplications);
        if (names) {
            lines.push({
                kind: "applications",
                description: names,
                applications: applicationPage(uniqueApplications, options),
                applicationCount: Math.max(
                    row.affectedCount,
                    uniqueApplications.length,
                ),
                applicationListLabel:
                    row.kind === HISTORY_KIND.delete
                        ? row.affectedCount === 1
                            ? "Deleted application"
                            : "Deleted applications"
                        : row.affectedCount === 1
                          ? "Added application"
                          : "Added applications",
            });
        } else if (row.kind === HISTORY_KIND.import) {
            const label = `${row.affectedCount.toLocaleString()} ${row.affectedCount === 1 ? "application" : "applications"} added`;
            lines.push({
                kind: "summary",
                description: `${row.affectedCount.toLocaleString()} ${row.affectedCount === 1 ? "application was" : "applications were"} added`,
                applications: [],
                applicationCount: 0,
                summaryChange: { icon: "applications", label },
            });
        }
    }
    if (row.kind === HISTORY_KIND.restore) {
        const delta = data.v;
        if (delta?.a?.length) {
            lines.push(
                ...groupedPatchChanges(
                    { ...row, affectedCount: delta.a.length },
                    delta.a,
                    direction,
                    options,
                ),
            );
        }
        const statusHistoryIds = new Set([
            ...(delta?.e?.c ?? []).map((event) => event.application_id),
            ...(delta?.e?.d ?? []).map((event) => event.application_id),
        ]);
        const namesById = new Map<string, string>();
        for (const patch of delta?.a ?? []) {
            namesById.set(patch.i, patch.n);
        }
        for (const application of [...(delta?.c ?? []), ...(delta?.d ?? [])]) {
            namesById.set(
                application.id,
                applicationTitle(
                    application.company_name,
                    application.role_title,
                ) ?? application.company_name,
            );
        }
        for (const application of data.m ?? []) {
            if (!application.i) continue;
            namesById.set(
                application.i,
                applicationTitle(application.n, application.r) ?? application.n,
            );
        }

        const added = direction === 1 ? delta?.c : delta?.d;
        const removed = direction === 1 ? delta?.d : delta?.c;
        for (const [label, applications] of [
            ["Added applications", added ?? []],
            ["Removed applications", removed ?? []],
        ] as const) {
            if (applications.length === 0) continue;
            const names = applications.map(
                (application) =>
                    applicationTitle(
                        application.company_name,
                        application.role_title,
                    ) ?? application.company_name,
            );
            lines.push({
                kind: "applications",
                description: applicationNames(names) ?? label,
                applications: applicationPage(names, options),
                applicationCount: applications.length,
                applicationListLabel:
                    applications.length === 1
                        ? label.replace("applications", "application")
                        : label,
            });
        }
        if (statusHistoryIds.size > 0) {
            const detailsByApplication = new Map<
                string,
                HistoryApplicationDetail
            >();
            const addStatusEntries = (
                events: ReturnType<typeof storedEvent>[],
                action: HistoryApplicationDetail["statusEntries"][number]["action"],
            ) => {
                for (const event of events) {
                    const detail = detailsByApplication.get(
                        event.application_id,
                    ) ?? {
                        application:
                            namesById.get(event.application_id) ??
                            "Application",
                        statusEntries: [],
                    };
                    detail.statusEntries.push({
                        action,
                        from: event.from_status,
                        to: event.to_status,
                        note: event.note,
                    });
                    detailsByApplication.set(event.application_id, detail);
                }
            };
            addStatusEntries(
                delta?.e?.c ?? [],
                direction === 1 ? "added" : "removed",
            );
            addStatusEntries(
                delta?.e?.d ?? [],
                direction === 1 ? "removed" : "restored",
            );
            const statusDetails = [...detailsByApplication.values()];
            const visibleStatusDetails = applicationPage(
                statusDetails,
                options,
            );
            const oneName =
                statusDetails.length === 1
                    ? statusDetails[0]?.application
                    : undefined;
            lines.push({
                kind: "summary",
                description:
                    direction === 1
                        ? oneName
                            ? `Updated status history for ${oneName}`
                            : `Updated status history for ${statusDetails.length.toLocaleString()} applications`
                        : oneName
                          ? `Restored previous status history for ${oneName}`
                          : `Restored previous status history for ${statusDetails.length.toLocaleString()} applications`,
                applications: visibleStatusDetails.map(
                    (detail) => detail.application,
                ),
                applicationDetails: visibleStatusDetails,
                applicationCount: statusDetails.length,
                summaryChange: {
                    icon: "statusHistory",
                    label:
                        direction === 1
                            ? "Status history updated"
                            : "Previous status history restored",
                },
            });
        }
        if (delta?.f) lines.push(...listFieldChanges(delta.f, direction));
    }
    return lines;
};

export const historyChangesFor = (
    row: StoredHistoryAction,
    direction: 0 | 1 = 1,
): string[] =>
    historyChangeDetailsFor(row, direction).map((change) => change.description);

const toStored = (row: HistoryDatabaseRow): StoredHistoryAction => ({
    id: String(row.id),
    kind: row.kind,
    affectedCount: row.affectedCount,
    data: row.data,
    reversible: row.reversible,
    occurredAt: row.occurredAt.toISOString(),
    undoneAt: row.undoneAt?.toISOString() ?? null,
});

export const historyReversalFor = (
    row: StoredHistoryAction,
): ListHistoryItem["reversal"] =>
    row.kind === HISTORY_KIND.undo && asData(row.data).q !== 1
        ? "redo"
        : "undo";

const undoRootIdFor = (row: StoredHistoryAction): string | null => {
    if (row.kind !== HISTORY_KIND.undo) return null;
    const data = asData(row.data);
    return data.r ?? data.o ?? null;
};

const historyCategoryFor = (kind: number): HistoryCategory => {
    if (kind === HISTORY_KIND.create || kind === HISTORY_KIND.import) {
        return "added";
    }
    if (kind === HISTORY_KIND.status || kind === HISTORY_KIND.arrangement) {
        return "moved";
    }
    if (kind === HISTORY_KIND.delete) return "deleted";
    if (kind === HISTORY_KIND.undo) return "reverted";
    if (kind === HISTORY_KIND.restore) return "restored";
    return "edited";
};

export const historyTitleValueFor = (
    row: StoredHistoryAction,
    undoRoot?: StoredHistoryAction,
): HistoryValueToken | null => {
    const source =
        row.kind === HISTORY_KIND.undo && asData(row.data).q === 1
            ? undoRoot
            : row;
    if (
        !source ||
        (source.kind !== HISTORY_KIND.status &&
            source.kind !== HISTORY_KIND.arrangement)
    ) {
        return null;
    }
    const code = source.kind === HISTORY_KIND.status ? "s" : "a";
    const values = new Set(
        asPatch(source.data).flatMap((patch) =>
            patch.f[code]?.[1] ? [patch.f[code][1]] : [],
        ),
    );
    if (values.size !== 1) return null;
    const [value] = values;
    return value
        ? {
              field: code === "s" ? "status" : "arrangement",
              value,
          }
        : null;
};

const historyDay = (date: Date): string =>
    date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });

const historyTime = (date: Date): string =>
    date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
    });

const restoreTargetFor = (
    row: StoredHistoryAction,
): HistoryRestoreTarget | null => {
    if (row.kind !== HISTORY_KIND.restore) return null;
    const data = asData(row.data);
    if (!data.t) return null;
    const occurredAt = new Date(data.t);
    return {
        title: data.n ?? "Earlier version",
        occurredAt: data.t,
        day: historyDay(occurredAt),
        time: historyTime(occurredAt),
    };
};

const toItem = (
    row: StoredHistoryAction,
    archived: boolean,
    canRestore: boolean,
    undoRoot?: StoredHistoryAction,
): ListHistoryItem => {
    const occurredAt = new Date(row.occurredAt);
    const undoDirection: 0 | 1 = asData(row.data).q === 1 ? 1 : 0;
    const detailSource = row.kind === HISTORY_KIND.undo ? undoRoot : row;
    const changes =
        row.kind === HISTORY_KIND.undo
            ? undoRoot
                ? historyChangeDetailsFor(undoRoot, undoDirection)
                : []
            : historyChangeDetailsFor(row);
    return {
        id: row.id,
        title: historyTitleFor(row),
        titleValue: historyTitleValueFor(row, undoRoot),
        changes: changes.slice(0, HISTORY_CHANGES_PREVIEW_SIZE),
        changeCount: changes.length,
        category: historyCategoryFor(row.kind),
        occurredAt: row.occurredAt,
        when: formatRelative(occurredAt),
        day: historyDay(occurredAt),
        time: historyTime(occurredAt),
        canUndo:
            (row.reversible || row.kind === HISTORY_KIND.undo) &&
            !row.undoneAt &&
            !archived,
        canRestore,
        reversal: historyReversalFor(row),
        undone: row.undoneAt !== null,
        archived,
        singleApplication: detailSource?.affectedCount === 1,
        restoreTarget: restoreTargetFor(row),
    };
};

export const encodeHistoryActions = (actions: StoredHistoryAction[]): Buffer =>
    gzipSync(Buffer.from(JSON.stringify(actions)), { level: 9 });

export const decodeHistoryActions = (
    payload: Uint8Array,
): StoredHistoryAction[] => {
    const parsed: unknown = JSON.parse(gunzipSync(payload).toString("utf8"));
    if (!Array.isArray(parsed)) throw new Error("History archive is invalid.");
    return parsed as StoredHistoryAction[];
};

const cloneVersionState = (state: VersionState): VersionState => ({
    list: { ...state.list },
    applications: new Map(
        [...state.applications].map(([id, application]) => [
            id,
            { ...application },
        ]),
    ),
    events: new Map([...state.events].map(([id, event]) => [id, { ...event }])),
});

const removeApplicationsFromState = (
    state: VersionState,
    applicationIds: Iterable<string>,
): void => {
    const removed = new Set(applicationIds);
    for (const id of removed) state.applications.delete(id);
    for (const [id, event] of state.events) {
        if (removed.has(event.application_id)) state.events.delete(id);
    }
};

const addApplicationsToState = (
    state: VersionState,
    applications: StoredApplication[],
): void => {
    for (const application of applications) {
        state.applications.set(application.id, { ...application });
    }
};

const removeEventsFromState = (
    state: VersionState,
    events: StoredApplicationEvent[],
): void => {
    for (const event of events) state.events.delete(event.id);
};

const addEventsToState = (
    state: VersionState,
    events: StoredApplicationEvent[],
): void => {
    for (const event of events) {
        if (state.applications.has(event.application_id)) {
            state.events.set(event.id, { ...event });
        }
    }
};

const applyPatchesToState = (
    state: VersionState,
    patches: ApplicationPatch[],
    value: 0 | 1,
): void => {
    for (const patch of patches) {
        const application = state.applications.get(patch.i);
        if (!application) continue;
        const updated = { ...application } as Record<string, unknown>;
        for (const [code, values] of Object.entries(patch.f)) {
            if (!(code in STORED_FIELD_MAP)) continue;
            const key = STORED_FIELD_MAP[code as keyof typeof STORED_FIELD_MAP];
            updated[key] = values[value];
        }
        state.applications.set(patch.i, updated as StoredApplication);
    }
};

const applyListFieldsToState = (
    state: VersionState,
    fields: FieldChanges,
    value: 0 | 1,
): void => {
    if (fields.n) state.list.name = fields.n[value] ?? "";
    if (fields.d) state.list.description = fields.d[value];
    if (fields.s) state.list.status = fields.s[value] ?? "active";
};

export const applyVersionDeltaToState = (
    state: VersionState,
    delta: VersionDelta,
    value: 0 | 1,
): void => {
    const removedEvents = value === 1 ? delta.e?.d : delta.e?.c;
    const addedEvents = value === 1 ? delta.e?.c : delta.e?.d;
    const removedApplications = value === 1 ? delta.d : delta.c;
    const addedApplications = value === 1 ? delta.c : delta.d;

    removeEventsFromState(state, removedEvents ?? []);
    removeApplicationsFromState(
        state,
        (removedApplications ?? []).map((application) => application.id),
    );
    addApplicationsToState(state, addedApplications ?? []);
    applyPatchesToState(state, delta.a ?? [], value);
    addEventsToState(state, addedEvents ?? []);
    applyListFieldsToState(state, delta.f ?? {}, value);
};

const applyHistoryRootToState = (
    state: VersionState,
    root: StoredHistoryAction,
    value: 0 | 1,
    replay: HistoryReplayData = {},
): void => {
    const data = asData(root.data);
    if (
        root.kind === HISTORY_KIND.create ||
        root.kind === HISTORY_KIND.import
    ) {
        if (value === 0) {
            removeApplicationsFromState(
                state,
                [...state.applications.values()]
                    .filter(
                        (application) =>
                            application.created_by_history_action_id ===
                            root.id,
                    )
                    .map((application) => application.id),
            );
        } else {
            addApplicationsToState(state, replay.d ?? data.d ?? []);
            addEventsToState(state, replay.e ?? []);
        }
        return;
    }

    if (
        root.kind === HISTORY_KIND.edit ||
        root.kind === HISTORY_KIND.status ||
        root.kind === HISTORY_KIND.arrangement ||
        root.kind === HISTORY_KIND.steps
    ) {
        if (value === 0) {
            applyPatchesToState(state, asPatch(root.data), 0);
            for (const [id, event] of state.events) {
                if (event.history_action_id === root.id)
                    state.events.delete(id);
            }
            addEventsToState(state, data.e ?? []);
        } else {
            removeEventsFromState(state, data.e ?? []);
            applyPatchesToState(state, asPatch(root.data), 1);
            addEventsToState(state, replay.e ?? []);
        }
        return;
    }

    if (root.kind === HISTORY_KIND.delete) {
        if (value === 0) {
            addApplicationsToState(state, data.d ?? []);
            addEventsToState(state, data.e ?? []);
        } else {
            removeApplicationsFromState(
                state,
                (data.d ?? []).map((application) => application.id),
            );
        }
        return;
    }

    if (root.kind === HISTORY_KIND.list) {
        applyListFieldsToState(state, data.f ?? {}, value);
        return;
    }

    if (root.kind === HISTORY_KIND.restore) {
        applyVersionDeltaToState(state, data.v ?? {}, value);
    }
};

export const historyStateAt = (
    current: VersionState,
    actions: StoredHistoryAction[],
    targetId: string,
): VersionState | null => {
    const byId = new Map(actions.map((action) => [action.id, action]));
    if (!byId.has(targetId)) return null;

    const target = cloneVersionState(current);
    const newer = actions
        .filter((action) => BigInt(action.id) > BigInt(targetId))
        .sort((left, right) => (BigInt(left.id) > BigInt(right.id) ? -1 : 1));
    for (const action of newer) {
        const data = asData(action.data);
        if (action.kind === HISTORY_KIND.undo) {
            const rootId = data.r ?? data.o;
            const root = rootId ? byId.get(rootId) : undefined;
            if (!root) return null;
            applyHistoryRootToState(target, root, data.q === 1 ? 0 : 1, data.x);
        } else {
            applyHistoryRootToState(target, action, 0);
        }
    }
    return target;
};

const recordsEqual = (
    left: Record<string, unknown>,
    right: Record<string, unknown>,
): boolean => {
    const keys = Object.keys(left);
    return (
        keys.length === Object.keys(right).length &&
        keys.every((key) => left[key] === right[key])
    );
};

const storedValueOf = (
    application: StoredApplication,
    code: keyof typeof STORED_FIELD_MAP,
): Scalar => {
    const value = application[STORED_FIELD_MAP[code]];
    return value === null ? null : String(value);
};

export const versionDeltaBetween = (
    before: VersionState,
    after: VersionState,
): VersionDelta => {
    const fields: FieldChanges = {};
    if (before.list.name !== after.list.name) {
        fields.n = [before.list.name, after.list.name];
    }
    if (before.list.description !== after.list.description) {
        fields.d = [before.list.description, after.list.description];
    }
    if (before.list.status !== after.list.status) {
        fields.s = [before.list.status, after.list.status];
    }

    const removedApplications = [...before.applications.values()].filter(
        (application) => !after.applications.has(application.id),
    );
    const createdApplications = [...after.applications.values()].filter(
        (application) => !before.applications.has(application.id),
    );
    const patches: ApplicationPatch[] = [];
    for (const application of after.applications.values()) {
        const old = before.applications.get(application.id);
        if (!old) continue;
        const changed: FieldChanges = {};
        for (const code of Object.keys(
            STORED_FIELD_MAP,
        ) as (keyof typeof STORED_FIELD_MAP)[]) {
            const from = storedValueOf(old, code);
            const to = storedValueOf(application, code);
            if (from !== to) changed[code] = [from, to];
        }
        if (Object.keys(changed).length > 0) {
            const amountChanged = ["mi", "ma", "b"].some(
                (code) => code in changed,
            );
            patches.push({
                i: application.id,
                n: old.company_name,
                f: changed,
                ...(amountChanged && !("cu" in changed)
                    ? {
                          p: [
                              old.pay_currency,
                              application.pay_currency,
                          ] as FieldChange,
                      }
                    : {}),
            });
        }
    }

    const removedEvents = [...before.events.values()].filter((event) => {
        const next = after.events.get(event.id);
        return !next || !recordsEqual(event, next);
    });
    const createdEvents = [...after.events.values()].filter((event) => {
        const old = before.events.get(event.id);
        return !old || !recordsEqual(event, old);
    });

    return {
        ...(Object.keys(fields).length > 0 ? { f: fields } : {}),
        ...(patches.length > 0 ? { a: patches } : {}),
        ...(createdApplications.length > 0 ? { c: createdApplications } : {}),
        ...(removedApplications.length > 0 ? { d: removedApplications } : {}),
        ...(createdEvents.length > 0 || removedEvents.length > 0
            ? {
                  e: {
                      ...(createdEvents.length > 0 ? { c: createdEvents } : {}),
                      ...(removedEvents.length > 0 ? { d: removedEvents } : {}),
                  },
              }
            : {}),
    };
};

const versionDeltaApplicationCount = (delta: VersionDelta): number =>
    new Set([
        ...(delta.a ?? []).map((patch) => patch.i),
        ...(delta.c ?? []).map((application) => application.id),
        ...(delta.d ?? []).map((application) => application.id),
        ...(delta.e?.c ?? []).map((event) => event.application_id),
        ...(delta.e?.d ?? []).map((event) => event.application_id),
    ]).size;

const versionDeltaHasChanges = (delta: VersionDelta): boolean =>
    versionDeltaApplicationCount(delta) > 0 ||
    Object.keys(delta.f ?? {}).length > 0;

const versionDeltaMatchesState = (
    state: VersionState,
    delta: VersionDelta,
    value: 0 | 1,
): boolean => {
    const absentApplications = value === 1 ? delta.d : delta.c;
    const presentApplications = value === 1 ? delta.c : delta.d;
    if (
        (absentApplications ?? []).some((application) =>
            state.applications.has(application.id),
        ) ||
        (presentApplications ?? []).some((application) => {
            const current = state.applications.get(application.id);
            return !current || !recordsEqual(current, application);
        })
    ) {
        return false;
    }
    for (const patch of delta.a ?? []) {
        const application = state.applications.get(patch.i);
        if (
            !application ||
            Object.entries(patch.f).some(([code, values]) => {
                if (!(code in STORED_FIELD_MAP)) return true;
                return (
                    storedValueOf(
                        application,
                        code as keyof typeof STORED_FIELD_MAP,
                    ) !== values[value]
                );
            })
        ) {
            return false;
        }
    }

    const absentEvents = value === 1 ? delta.e?.d : delta.e?.c;
    const presentEvents = value === 1 ? delta.e?.c : delta.e?.d;
    if (
        (absentEvents ?? []).some((event) => state.events.has(event.id)) ||
        (presentEvents ?? []).some((event) => {
            const current = state.events.get(event.id);
            return !current || !recordsEqual(current, event);
        })
    ) {
        return false;
    }

    const listValues: Record<string, Scalar> = {
        n: state.list.name,
        d: state.list.description,
        s: state.list.status,
    };
    return !Object.entries(delta.f ?? {}).some(
        ([code, values]) => listValues[code] !== values[value],
    );
};

const historyActionsForList = async (
    client: QueryClient,
    userId: string,
    listId: string,
): Promise<StoredHistoryAction[]> => {
    const recent = await rowsOf<HistoryDatabaseRow>(
        client,
        `
            select
                h.id::text as id,
                h.kind,
                h.affected_count as "affectedCount",
                h.data,
                h.reversible,
                h.occurred_at as "occurredAt",
                h.undone_at as "undoneAt"
            from list_history_actions h
            join lists l on l.id = h.list_id
            where h.list_id = $1 and l.user_id = $2
        `,
        [listId, userId],
    );
    const archives = await rowsOf<{ payload: Buffer }>(
        client,
        `
            select a.payload
            from list_history_archives a
            join lists l on l.id = a.list_id
            where a.list_id = $1 and l.user_id = $2
        `,
        [listId, userId],
    );
    return [
        ...recent.map(toStored),
        ...archives.flatMap((archive) => decodeHistoryActions(archive.payload)),
    ];
};

const historyActionForList = async (
    client: QueryClient,
    userId: string,
    listId: string,
    actionId: string,
): Promise<StoredHistoryAction | null> => {
    const [recent] = await rowsOf<HistoryDatabaseRow>(
        client,
        `
            select
                h.id::text as id,
                h.kind,
                h.affected_count as "affectedCount",
                h.data,
                h.reversible,
                h.occurred_at as "occurredAt",
                h.undone_at as "undoneAt"
            from list_history_actions h
            join lists l on l.id = h.list_id
            where h.list_id = $1 and l.user_id = $2 and h.id = $3::bigint
        `,
        [listId, userId, actionId],
    );
    if (recent) return toStored(recent);

    const [archive] = await rowsOf<{ payload: Buffer }>(
        client,
        `
            select a.payload
            from list_history_archives a
            join lists l on l.id = a.list_id
            where a.list_id = $1
                and l.user_id = $2
                and a.first_action_id <= $3::bigint
                and a.last_action_id >= $3::bigint
            order by a.last_action_id desc
            limit 1
        `,
        [listId, userId, actionId],
    );
    if (!archive) return null;
    return (
        decodeHistoryActions(archive.payload).find(
            (action) => action.id === actionId,
        ) ?? null
    );
};

export const getListHistory = async (
    userId: string,
    listId: string,
    beforeId: string | null = null,
    pageSize = HISTORY_INITIAL_PAGE_SIZE,
): Promise<ListHistoryPage> => {
    const cursor = beforeId ?? MAX_ID;
    const limit = Math.min(Math.max(pageSize, 1), 50);
    const pool = getPool();
    const recent = await rowsOf<HistoryDatabaseRow>(
        pool,
        `
            select
                h.id::text as id,
                h.kind,
                h.affected_count as "affectedCount",
                h.data,
                h.reversible,
                h.occurred_at as "occurredAt",
                h.undone_at as "undoneAt"
            from list_history_actions h
            join lists l on l.id = h.list_id
            where h.list_id = $1
                and l.user_id = $2
                and h.id < $3::bigint
            order by h.id desc
            limit $4::int
        `,
        [listId, userId, cursor, limit + 1],
    );

    let archived: StoredHistoryAction[] = [];
    let archiveRowsRead = 0;
    if (recent.length <= limit) {
        const archives = await rowsOf<{ payload: Buffer }>(
            pool,
            `
                select a.payload
                from list_history_archives a
                join lists l on l.id = a.list_id
                where a.list_id = $1
                    and l.user_id = $2
                    and a.first_action_id < $3::bigint
                order by a.last_action_id desc
                limit $4::int
            `,
            [listId, userId, cursor, ARCHIVE_READ_LIMIT],
        );
        archiveRowsRead = archives.length;
        archived = archives
            .flatMap((archive) => decodeHistoryActions(archive.payload))
            .filter((action) => BigInt(action.id) < BigInt(cursor));
    }

    const combined = [...recent.map(toStored), ...archived].sort(
        (left, right) => (BigInt(left.id) > BigInt(right.id) ? -1 : 1),
    );
    const archivedIds = new Set(archived.map((action) => action.id));
    const visible = combined.slice(0, limit);
    const actionsById = new Map(combined.map((action) => [action.id, action]));
    const missingRootIds = [
        ...new Set(
            visible
                .map(undoRootIdFor)
                .filter(
                    (id): id is string => id !== null && !actionsById.has(id),
                ),
        ),
    ];
    if (missingRootIds.length > 0) {
        const roots = await rowsOf<HistoryDatabaseRow>(
            pool,
            `
                select
                    h.id::text as id,
                    h.kind,
                    h.affected_count as "affectedCount",
                    h.data,
                    h.reversible,
                    h.occurred_at as "occurredAt",
                    h.undone_at as "undoneAt"
                from list_history_actions h
                join lists l on l.id = h.list_id
                where h.list_id = $1
                    and l.user_id = $2
                    and h.id = any($3::bigint[])
            `,
            [listId, userId, missingRootIds],
        );
        for (const root of roots.map(toStored)) {
            actionsById.set(root.id, root);
        }
    }
    const items = visible.map((action, index) => {
        const rootId = undoRootIdFor(action);
        return toItem(
            action,
            archivedIds.has(action.id),
            beforeId !== null || index > 0,
            rootId ? actionsById.get(rootId) : undefined,
        );
    });
    return {
        items,
        nextCursor: items.at(-1)?.id ?? null,
        hasMore:
            combined.length > limit || archiveRowsRead === ARCHIVE_READ_LIMIT,
    };
};

export const historyApplicationsPageFor = (
    row: StoredHistoryAction,
    direction: 0 | 1,
    changeIndex: number,
    requestedPage: number,
): HistoryApplicationsPage | null => {
    const pageFor = (page: number) =>
        historyChangeDetailsFor(row, direction, {
            applicationOffset: page * HISTORY_APPLICATIONS_PAGE_SIZE,
            applicationLimit: HISTORY_APPLICATIONS_PAGE_SIZE,
        })[changeIndex];

    const requested = Math.max(0, Math.trunc(requestedPage));
    let change = pageFor(requested);
    if (!change || change.applicationCount < 1) return null;

    const pageCount = Math.ceil(
        change.applicationCount / HISTORY_APPLICATIONS_PAGE_SIZE,
    );
    const page = Math.min(requested, pageCount - 1);
    if (page !== requested) change = pageFor(page);
    if (!change || change.applications.length === 0) return null;

    return {
        applications: change.applications,
        ...(change.applicationDetails
            ? { applicationDetails: change.applicationDetails }
            : {}),
        page,
        pageCount,
        total: change.applicationCount,
    };
};

export const historyChangesPageFor = (
    row: StoredHistoryAction,
    direction: 0 | 1,
    requestedOffset: number,
): HistoryChangesPage => {
    const changes = historyChangeDetailsFor(row, direction);
    const offset = Math.min(
        Math.max(0, Math.trunc(requestedOffset)),
        changes.length,
    );
    return {
        changes: changes.slice(offset, offset + HISTORY_CHANGES_PAGE_SIZE),
        offset,
        total: changes.length,
    };
};

export const getListHistoryApplicationsPage = async (
    userId: string,
    listId: string,
    actionId: string,
    changeIndex: number,
    page: number,
): Promise<HistoryApplicationsPage | null> => {
    const pool = getPool();
    const action = await historyActionForList(pool, userId, listId, actionId);
    if (!action) return null;

    if (action.kind !== HISTORY_KIND.undo) {
        return historyApplicationsPageFor(action, 1, changeIndex, page);
    }

    const rootId = undoRootIdFor(action);
    if (!rootId) return null;
    const root = await historyActionForList(pool, userId, listId, rootId);
    if (!root) return null;
    const direction: 0 | 1 = asData(action.data).q === 1 ? 1 : 0;
    return historyApplicationsPageFor(root, direction, changeIndex, page);
};

export const getListHistoryChangesPage = async (
    userId: string,
    listId: string,
    actionId: string,
    offset: number,
): Promise<HistoryChangesPage | null> => {
    const pool = getPool();
    const action = await historyActionForList(pool, userId, listId, actionId);
    if (!action) return null;

    if (action.kind !== HISTORY_KIND.undo) {
        return historyChangesPageFor(action, 1, offset);
    }

    const rootId = undoRootIdFor(action);
    if (!rootId) return null;
    const root = await historyActionForList(pool, userId, listId, rootId);
    if (!root) return null;
    const direction: 0 | 1 = asData(action.data).q === 1 ? 1 : 0;
    return historyChangesPageFor(root, direction, offset);
};

const sameCurrentValues = (
    snapshot: ApplicationSnapshot,
    fields: FieldChanges,
    expected: 0 | 1,
): boolean =>
    Object.entries(fields).every(([code, values]) => {
        if (!(code in FIELD_MAP)) return false;
        return (
            valueOf(snapshot, code as keyof typeof FIELD_MAP) ===
            values[expected]
        );
    });

const applyPatches = async (
    client: QueryClient,
    userId: string,
    patches: ApplicationPatch[],
    value: 0 | 1,
): Promise<void> => {
    const updates = patches.map((patch) => ({
        i: patch.i,
        f: Object.fromEntries(
            Object.entries(patch.f).map(([code, values]) => [
                code,
                values[value],
            ]),
        ),
    }));
    await client.query({
        text: `
            update applications a
            set
                company_name = case when patch.f ? 'c'
                    then patch.f ->> 'c' else a.company_name end,
                role_title = case when patch.f ? 'r'
                    then patch.f ->> 'r' else a.role_title end,
                status = case when patch.f ? 's'
                    then (patch.f ->> 's')::application_status
                    else a.status end,
                url = case when patch.f ? 'u'
                    then patch.f ->> 'u' else a.url end,
                location = case when patch.f ? 'l'
                    then patch.f ->> 'l' else a.location end,
                arrangement = case when patch.f ? 'a'
                    then (patch.f ->> 'a')::work_arrangement
                    else a.arrangement end,
                notes = case when patch.f ? 'n'
                    then patch.f ->> 'n' else a.notes end,
                pay_min = case when patch.f ? 'mi'
                    then (patch.f ->> 'mi')::numeric else a.pay_min end,
                pay_max = case when patch.f ? 'ma'
                    then (patch.f ->> 'ma')::numeric else a.pay_max end,
                pay_currency = case when patch.f ? 'cu'
                    then (patch.f ->> 'cu')::char(3) else a.pay_currency end,
                pay_period = case when patch.f ? 'pe'
                    then (patch.f ->> 'pe')::pay_period else a.pay_period end,
                bonus_amount = case when patch.f ? 'b'
                    then (patch.f ->> 'b')::numeric else a.bonus_amount end,
                pay_note = case when patch.f ? 'pn'
                    then patch.f ->> 'pn' else a.pay_note end,
                applied_at = case when patch.f ? 'd'
                    then (patch.f ->> 'd')::date else a.applied_at end
            from lists l, jsonb_to_recordset($1::jsonb) as patch(i uuid, f jsonb)
            where patch.i = a.id
                and a.list_id = l.id
                and l.user_id = $2
        `,
        values: [JSON.stringify(updates), userId],
    });
};

const restoreApplications = async (
    client: QueryClient,
    userId: string,
    listId: string,
    applications: NonNullable<HistoryData["d"]>,
): Promise<void> => {
    await client.query({
        text: `
            insert into applications (
                id, list_id, position, company_name, role_title, status, url,
                location, arrangement, notes, pay_min, pay_max, pay_currency,
                pay_period, bonus_amount, pay_note, applied_at, created_at,
                updated_at, created_by_history_action_id
            )
            select
                row.id::uuid, l.id, row.position, row.company_name,
                row.role_title, row.status::application_status, row.url,
                row.location, row.arrangement::work_arrangement, row.notes,
                row.pay_min::numeric, row.pay_max::numeric,
                row.pay_currency::char(3), row.pay_period::pay_period,
                row.bonus_amount::numeric, row.pay_note, row.applied_at::date,
                row.created_at::timestamptz, row.updated_at::timestamptz,
                row.created_by_history_action_id::bigint
            from lists l
            cross join jsonb_to_recordset($1::jsonb) as row(
                id text, position int, company_name text, role_title text,
                status text, url text, location text, arrangement text,
                notes text, pay_min text, pay_max text, pay_currency text,
                pay_period text, bonus_amount text, pay_note text,
                applied_at text, created_at text, updated_at text,
                created_by_history_action_id text
            )
            where l.id = $2 and l.user_id = $3
        `,
        values: [JSON.stringify(applications), listId, userId],
    });
};

const restoreEvents = async (
    client: QueryClient,
    userId: string,
    events: NonNullable<HistoryData["e"]>,
): Promise<void> => {
    if (events.length === 0) return;
    await client.query({
        text: `
            insert into application_events (
                id, application_id, from_status, to_status, note, occurred_at,
                history_action_id
            )
            select
                row.id::uuid, row.application_id::uuid,
                row.from_status::application_status,
                row.to_status::application_status, row.note,
                row.occurred_at::timestamptz, row.history_action_id::bigint
            from jsonb_to_recordset($1::jsonb) as row(
                id text, application_id text, from_status text,
                to_status text, note text, occurred_at text,
                history_action_id text
            )
            join applications a on a.id = row.application_id::uuid
            join lists l on l.id = a.list_id
            where l.user_id = $2
        `,
        values: [JSON.stringify(events), userId],
    });
};

const historyRowForUpdate = async (
    client: QueryClient,
    userId: string,
    listId: string,
    actionId: string,
): Promise<HistoryDatabaseRow | null> => {
    const [row] = await rowsOf<HistoryDatabaseRow>(
        client,
        `
            select
                h.id::text as id,
                h.list_id as "listId",
                h.kind,
                h.affected_count as "affectedCount",
                h.data,
                h.reversible,
                h.occurred_at as "occurredAt",
                h.undone_at as "undoneAt"
            from list_history_actions h
            join lists l on l.id = h.list_id
            where h.id = $1::bigint
                and h.list_id = $2
                and l.user_id = $3
            for update of h
        `,
        [actionId, listId, userId],
    );
    return row ?? null;
};

const createdApplicationsForAction = async (
    client: QueryClient,
    userId: string,
    listId: string,
    actionId: string,
): Promise<{ id: string; changed: boolean }[]> =>
    rowsOf<{ id: string; changed: boolean }>(
        client,
        `
            select
                a.id::text as id,
                a.updated_at is distinct from a.created_at as changed
            from applications a
            join lists l on l.id = a.list_id
            where a.list_id = $1
                and l.user_id = $2
                and a.created_by_history_action_id = $3::bigint
            order by a.id
            for update of a
        `,
        [listId, userId, actionId],
    );

const deleteApplications = async (
    client: QueryClient,
    userId: string,
    listId: string,
    applicationIds: string[],
): Promise<void> => {
    if (applicationIds.length === 0) return;
    await client.query({
        text: `
            delete from applications a
            using lists l
            where a.list_id = l.id
                and a.list_id = $1
                and l.user_id = $2
                and a.id = any($3::uuid[])
        `,
        values: [listId, userId, applicationIds],
    });
};

const deleteEvents = async (
    client: QueryClient,
    userId: string,
    events: NonNullable<HistoryData["e"]>,
): Promise<void> => {
    if (events.length === 0) return;
    await client.query({
        text: `
            delete from application_events e
            using applications a, lists l
            where e.application_id = a.id
                and a.list_id = l.id
                and l.user_id = $1
                and e.id = any($2::uuid[])
        `,
        values: [userId, events.map((event) => event.id)],
    });
};

const deleteEventsForAction = async (
    client: QueryClient,
    userId: string,
    actionId: string,
): Promise<void> => {
    await client.query({
        text: `
            delete from application_events e
            using applications a, lists l
            where e.application_id = a.id
                and a.list_id = l.id
                and l.user_id = $1
                and e.history_action_id = $2::bigint
        `,
        values: [userId, actionId],
    });
};

const applyListFields = async (
    client: QueryClient,
    userId: string,
    listId: string,
    fields: FieldChanges,
    value: 0 | 1,
): Promise<void> => {
    await client.query({
        text: `
            update lists l
            set
                name = case when $1 then $2 else l.name end,
                description = case when $3 then $4 else l.description end,
                status = case when $5 then $6::list_status else l.status end
            where l.id = $7 and l.user_id = $8
        `,
        values: [
            "n" in fields,
            fields.n?.[value] ?? null,
            "d" in fields,
            fields.d?.[value] ?? null,
            "s" in fields,
            fields.s?.[value] ?? "active",
            listId,
            userId,
        ],
    });
};

const applyVersionDelta = async (
    client: QueryClient,
    userId: string,
    listId: string,
    delta: VersionDelta,
    value: 0 | 1,
): Promise<void> => {
    const removedEvents = value === 1 ? delta.e?.d : delta.e?.c;
    const addedEvents = value === 1 ? delta.e?.c : delta.e?.d;
    const removedApplications = value === 1 ? delta.d : delta.c;
    const addedApplications = value === 1 ? delta.c : delta.d;

    await deleteEvents(client, userId, removedEvents ?? []);
    await deleteApplications(
        client,
        userId,
        listId,
        (removedApplications ?? []).map((application) => application.id),
    );
    await restoreApplications(client, userId, listId, addedApplications ?? []);
    await applyPatches(client, userId, delta.a ?? [], value);
    await restoreEvents(client, userId, addedEvents ?? []);
    await applyListFields(client, userId, listId, delta.f ?? {}, value);
};

const sameStoredRecord = (
    current: Record<string, unknown>,
    expected: Record<string, unknown>,
): boolean => {
    const entries = Object.entries(current);
    return (
        entries.length === Object.keys(expected).length &&
        entries.every(([key, value]) => expected[key] === value)
    );
};

const storedApplicationsMatch = (
    current: ApplicationSnapshot[],
    stored: NonNullable<HistoryData["d"]>,
): boolean => {
    const expected = new Map(stored.map((row) => [row.id, row]));
    return (
        current.length === stored.length &&
        current.every((row) => {
            const original = expected.get(row.id);
            return (
                original !== undefined &&
                sameStoredRecord(storedApplication(row), original)
            );
        })
    );
};

const storedEventsMatch = (
    current: ApplicationEventSnapshot[],
    stored: NonNullable<HistoryData["e"]>,
): boolean => {
    const expected = new Map(stored.map((event) => [event.id, event]));
    return (
        current.length === stored.length &&
        current.every((event) => {
            const original = expected.get(event.id);
            return (
                original !== undefined &&
                sameStoredRecord(storedEvent(event), original)
            );
        })
    );
};

export type UndoHistoryResult = { ok: true } | { ok: false; error: string };

export const restoreHistoryVersion = async (
    userId: string,
    listId: string,
    targetActionId: string,
): Promise<UndoHistoryResult> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction<UndoHistoryResult>(async (client) => {
        const current = await currentVersionState(client, userId, listId);
        if (!current) {
            return { ok: false, error: "This list is no longer available." };
        }

        const actions = await historyActionsForList(client, userId, listId);
        const targetAction = actions.find(
            (action) => action.id === targetActionId,
        );
        if (!targetAction) {
            return {
                ok: false,
                error: "That version is no longer available.",
            };
        }

        const target = historyStateAt(current, actions, targetActionId);
        if (!target) {
            return {
                ok: false,
                error: "That version does not contain enough information to restore safely.",
            };
        }
        const delta = versionDeltaBetween(current, target);
        if (!versionDeltaHasChanges(delta)) {
            return { ok: false, error: "This is already the current version." };
        }

        const namedApplicationIds = new Set([
            ...(delta.a ?? []).map((patch) => patch.i),
            ...(delta.c ?? []).map((application) => application.id),
            ...(delta.d ?? []).map((application) => application.id),
        ]);
        const eventOnlyIds = new Set([
            ...(delta.e?.c ?? []).map((event) => event.application_id),
            ...(delta.e?.d ?? []).map((event) => event.application_id),
        ]);
        const eventOnlyApplications = [...eventOnlyIds].flatMap((id) => {
            if (namedApplicationIds.has(id)) return [];
            const application =
                target.applications.get(id) ?? current.applications.get(id);
            return application
                ? [
                      {
                          i: id,
                          n: application.company_name,
                          r: application.role_title,
                      },
                  ]
                : [];
        });

        await applyVersionDelta(client, userId, listId, delta, 1);
        const actionId = await reserveActionId(client);
        await insertAction(client, {
            id: actionId,
            userId,
            listId,
            kind: HISTORY_KIND.restore,
            affectedCount: Math.max(1, versionDeltaApplicationCount(delta)),
            data: {
                n: historyTitleFor(targetAction),
                o: targetAction.id,
                t: targetAction.occurredAt,
                v: delta,
                ...(eventOnlyApplications.length > 0
                    ? { m: eventOnlyApplications }
                    : {}),
            },
        });
        recordedActionId = actionId;
        return { ok: true };
    });
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

export const undoHistoryAction = async (
    userId: string,
    listId: string,
    actionId: string,
): Promise<UndoHistoryResult> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction<UndoHistoryResult>(async (client) => {
        const row = await historyRowForUpdate(client, userId, listId, actionId);
        if (!row) {
            return {
                ok: false,
                error: "This change can no longer be undone.",
            };
        }
        if (
            row.undoneAt ||
            (!row.reversible && row.kind !== HISTORY_KIND.undo)
        ) {
            return {
                ok: false,
                error: "This change was already undone.",
            };
        }

        const targetData = asData(row.data);
        const rootId =
            row.kind === HISTORY_KIND.undo
                ? (targetData.r ?? targetData.o)
                : row.id;
        if (!rootId) {
            return {
                ok: false,
                error: "This older change does not have enough information to be redone.",
            };
        }
        const root =
            rootId === row.id
                ? row
                : await historyRowForUpdate(client, userId, listId, rootId);
        if (!root || root.kind === HISTORY_KIND.undo) {
            return {
                ok: false,
                error: "This older change does not have enough information to be redone.",
            };
        }

        // A normal action applies its change. An undo row records whether it
        // applied the original change (1) or its inverse (0). Reversing the row
        // simply chooses the opposite direction, without copying the root action.
        const applyForward =
            row.kind === HISTORY_KIND.undo && targetData.q !== 1;
        const expectedValue: 0 | 1 = applyForward ? 0 : 1;
        const appliedValue: 0 | 1 = applyForward ? 1 : 0;
        const rootData = asData(root.data);
        const replay: HistoryReplayData = {};
        let saveReplay = false;

        if (
            root.kind === HISTORY_KIND.create ||
            root.kind === HISTORY_KIND.import
        ) {
            if (applyForward) {
                const saved = targetData.x?.d ?? [];
                if (saved.length !== root.affectedCount) {
                    return {
                        ok: false,
                        error: "This older change does not have enough information to be redone.",
                    };
                }
                const existing = await applicationSnapshots(
                    client,
                    userId,
                    saved.map((application) => application.id),
                );
                if (existing.length > 0) {
                    return {
                        ok: false,
                        error: "One of these applications already exists.",
                    };
                }
                await restoreApplications(client, userId, listId, saved);
                await restoreEvents(client, userId, targetData.x?.e ?? []);
            } else {
                const created = await createdApplicationsForAction(
                    client,
                    userId,
                    listId,
                    root.id,
                );
                if (
                    created.length !== root.affectedCount ||
                    created.some((application) => application.changed)
                ) {
                    return {
                        ok: false,
                        error: "One or more applications were edited later. Undo the newer changes first.",
                    };
                }
                const applicationIds = created.map(
                    (application) => application.id,
                );
                const snapshots = await applicationSnapshots(
                    client,
                    userId,
                    applicationIds,
                );
                const events = await applicationEvents(
                    client,
                    userId,
                    applicationIds,
                );
                replay.d = snapshots.map(storedApplication);
                replay.e = events.map(storedEvent);
                saveReplay = true;
                await deleteApplications(
                    client,
                    userId,
                    listId,
                    applicationIds,
                );
            }
        } else if (
            root.kind === HISTORY_KIND.edit ||
            root.kind === HISTORY_KIND.status ||
            root.kind === HISTORY_KIND.arrangement ||
            root.kind === HISTORY_KIND.steps
        ) {
            if (
                applyForward &&
                (root.kind === HISTORY_KIND.status ||
                    root.kind === HISTORY_KIND.steps) &&
                targetData.x === undefined
            ) {
                return {
                    ok: false,
                    error: "This older change does not have enough information to be redone.",
                };
            }

            const patches = asPatch(root.data);
            const replayEvents = targetData.x?.e ?? [];
            const applicationIds = [
                ...new Set([
                    ...patches.map((patch) => patch.i),
                    ...(rootData.e ?? []).map((event) => event.application_id),
                    ...replayEvents.map((event) => event.application_id),
                ]),
            ];
            const current = await applicationSnapshots(
                client,
                userId,
                applicationIds,
            );
            const currentById = new Map(current.map((item) => [item.id, item]));
            const conflict = patches.some((patch) => {
                const snapshot = currentById.get(patch.i);
                return (
                    !snapshot ||
                    !sameCurrentValues(snapshot, patch.f, expectedValue)
                );
            });
            if (conflict) {
                return {
                    ok: false,
                    error: "This information changed later. Undo the newer change first.",
                };
            }

            const currentEvents = await applicationEvents(
                client,
                userId,
                applicationIds,
            );
            if (applyForward) {
                const eventsById = new Map(
                    currentEvents.map((event) => [
                        event.id,
                        storedEvent(event),
                    ]),
                );
                if (
                    (rootData.e ?? []).some((event) => {
                        const currentEvent = eventsById.get(event.id);
                        return (
                            currentEvent === undefined ||
                            !sameStoredRecord(currentEvent, event)
                        );
                    })
                ) {
                    return {
                        ok: false,
                        error: "The status history changed later. Undo the newer change first.",
                    };
                }
                await deleteEvents(client, userId, rootData.e ?? []);
                await applyPatches(client, userId, patches, appliedValue);
                await restoreEvents(client, userId, replayEvents);
            } else {
                replay.e = currentEvents
                    .filter((event) => event.historyActionId === root.id)
                    .map(storedEvent);
                saveReplay =
                    root.kind === HISTORY_KIND.status ||
                    root.kind === HISTORY_KIND.steps;
                await applyPatches(client, userId, patches, appliedValue);
                await deleteEventsForAction(client, userId, root.id);
                await restoreEvents(client, userId, rootData.e ?? []);
            }
        } else if (root.kind === HISTORY_KIND.delete) {
            const deleted = rootData.d ?? [];
            const ids = deleted.map((application) => application.id);
            if (ids.length === 0) {
                return {
                    ok: false,
                    error: "The deleted applications can no longer be restored.",
                };
            }
            if (applyForward) {
                const current = await applicationSnapshots(client, userId, ids);
                const currentEvents = await applicationEvents(
                    client,
                    userId,
                    ids,
                );
                if (
                    !storedApplicationsMatch(current, deleted) ||
                    !storedEventsMatch(currentEvents, rootData.e ?? [])
                ) {
                    return {
                        ok: false,
                        error: "One or more restored applications were edited later. Undo the newer changes first.",
                    };
                }
                await deleteApplications(client, userId, listId, ids);
            } else {
                const existing = await applicationSnapshots(
                    client,
                    userId,
                    ids,
                );
                if (existing.length > 0) {
                    return {
                        ok: false,
                        error: "That application has already been restored.",
                    };
                }
                await restoreApplications(client, userId, listId, deleted);
                await restoreEvents(client, userId, rootData.e ?? []);
            }
        } else if (root.kind === HISTORY_KIND.list) {
            const current = await listSnapshot(client, userId, listId);
            const fields = rootData.f ?? {};
            const currentValues: Record<string, Scalar> = {
                n: current?.name ?? null,
                d: current?.description ?? null,
                s: current?.status ?? null,
            };
            if (
                !current ||
                Object.entries(fields).some(
                    ([code, values]) =>
                        currentValues[code] !== values[expectedValue],
                )
            ) {
                return {
                    ok: false,
                    error: "The list was edited later. Undo the newer change first.",
                };
            }
            await applyListFields(client, userId, listId, fields, appliedValue);
        } else if (root.kind === HISTORY_KIND.restore) {
            const delta = rootData.v;
            if (!delta) {
                return {
                    ok: false,
                    error: "This restored version no longer has enough information to reverse.",
                };
            }
            const current = await currentVersionState(client, userId, listId);
            if (
                !current ||
                !versionDeltaMatchesState(current, delta, expectedValue)
            ) {
                return {
                    ok: false,
                    error: "The list changed later. Undo the newer changes first.",
                };
            }
            await applyVersionDelta(
                client,
                userId,
                listId,
                delta,
                appliedValue,
            );
        } else {
            return { ok: false, error: "This change cannot be undone." };
        }

        const undoId = await reserveActionId(client);
        await client.query({
            text: `
                update list_history_actions
                set undone_at = now(), undone_by_action_id = $1::bigint
                where id = $2::bigint and undone_at is null
            `,
            values: [undoId, actionId],
        });
        await insertAction(client, {
            id: undoId,
            userId,
            listId,
            kind: HISTORY_KIND.undo,
            affectedCount: root.affectedCount,
            data: {
                o: row.id,
                r: root.id,
                q: applyForward ? 1 : 0,
                n: historyTitleFor(toStored(root)),
                ...(saveReplay ? { x: replay } : {}),
            },
        });
        recordedActionId = undoId;
        return { ok: true };
    });
    await maintainHistoryAfterAction(recordedActionId);
    return result;
};

export const archiveNextHistoryChunk = async (options: {
    before: Date;
    keepRecent: number;
    minimumActions: number;
    batchSize: number;
}): Promise<number> =>
    withTransaction(async (client) => {
        const rows = await rowsOf<HistoryDatabaseRow & { listId: string }>(
            client,
            `
                with candidate as materialized (
                    select h.list_id
                    from list_history_actions h
                    where h.occurred_at < $1
                        and not exists (
                            select 1
                            from list_history_actions active
                            where active.list_id = h.list_id
                                and active.kind = 9
                                and active.undone_at is null
                                and coalesce(
                                    active.data ->> 'r',
                                    active.data ->> 'o'
                                ) = h.id::text
                        )
                        and h.id < coalesce(
                            (
                                select hot.id
                                from list_history_actions hot
                                where hot.list_id = h.list_id
                                order by hot.id desc
                                offset greatest($3::int - 1, 0)
                                limit 1
                            ),
                            0
                        )
                    group by h.list_id
                    having count(*) >= $2::int
                    order by min(h.id)
                    limit 1
                ), boundary as materialized (
                    select h.id
                    from list_history_actions h
                    join candidate c on c.list_id = h.list_id
                    order by h.id desc
                    offset greatest($3::int - 1, 0)
                    limit 1
                )
                select
                    h.id::text as id,
                    h.list_id as "listId",
                    h.kind,
                    h.affected_count as "affectedCount",
                    h.data,
                    h.reversible,
                    h.occurred_at as "occurredAt",
                    h.undone_at as "undoneAt"
                from list_history_actions h
                join candidate c on c.list_id = h.list_id
                where h.occurred_at < $1
                    and not exists (
                        select 1
                        from list_history_actions active
                        where active.list_id = h.list_id
                            and active.kind = 9
                            and active.undone_at is null
                            and coalesce(
                                active.data ->> 'r',
                                active.data ->> 'o'
                            ) = h.id::text
                    )
                    and h.id < (select id from boundary)
                order by h.id
                limit $4::int
                for update of h skip locked
            `,
            [
                options.before,
                options.minimumActions,
                options.keepRecent,
                options.batchSize,
            ],
        );
        if (rows.length === 0) return 0;

        const stored = rows.map(toStored);
        const first = rows[0];
        const last = rows.at(-1) as (typeof rows)[number];
        const payload = encodeHistoryActions(stored);
        await client.query({
            text: `
                insert into list_history_archives (
                    first_action_id, list_id, last_action_id,
                    first_occurred_at, last_occurred_at, action_count, payload
                )
                values ($1::bigint, $2, $3::bigint, $4, $5, $6, $7)
            `,
            values: [
                first.id,
                first.listId,
                last.id,
                first.occurredAt,
                last.occurredAt,
                rows.length,
                payload,
            ],
        });
        await client.query({
            text: "delete from list_history_actions where id = any($1::bigint[])",
            values: [rows.map((row) => row.id)],
        });
        return rows.length;
    });
