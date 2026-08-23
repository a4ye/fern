import { gzipSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "@neondatabase/serverless";
import { getPool, withTransaction } from "@/db/client";
import {
    STATUS_META,
    arrangementLabel,
    formatRelative,
    type ApplicationStatus,
    type Arrangement,
} from "@/components/dashboard/data";

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
};

type ListSnapshot = {
    name: string;
    description: string | null;
    status: string;
};

type HistoryData = {
    a?: ApplicationPatch[];
    d?: ReturnType<typeof storedApplication>[];
    e?: ReturnType<typeof storedEvent>[];
    f?: FieldChanges;
    n?: string;
    o?: string;
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

export type ListHistoryItem = {
    id: string;
    title: string;
    changes: string[];
    occurredAt: string;
    when: string;
    canUndo: boolean;
    undone: boolean;
    archived: boolean;
};

export type ListHistoryPage = {
    items: ListHistoryItem[];
    nextCursor: string | null;
    hasMore: boolean;
};

const MAX_ID = "9223372036854775807";
const HISTORY_PAGE_SIZE = 20;
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

const FIELD_LABELS: Record<keyof typeof FIELD_MAP, string> = {
    c: "Company",
    r: "Role",
    s: "Status",
    u: "URL",
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
        return Object.keys(fields).length > 0
            ? [{ i: row.id, n: old.companyName, f: fields }]
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
            await insertAction(client, {
                id,
                userId: input.userId,
                listId: input.listId,
                kind: input.kind,
                affectedCount: changed.affectedCount,
                data: input.name ? { n: input.name } : {},
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

    let removed: ReturnType<typeof storedEvent>[] = [];
    if (input.trackRemovedEvents) {
        const eventsAfter = await applicationEvents(
            client,
            input.userId,
            input.applicationIds,
        );
        const remaining = new Set(eventsAfter.map((event) => event.id));
        removed = eventsBefore
            .filter((event) => !remaining.has(event.id))
            .map(storedEvent);
    }

    const addedEvent = await rowsOf<{ exists: boolean }>(
        client,
        `select exists(
                select 1 from application_events
                where history_action_id = $1::bigint
            ) as exists`,
        [id],
    );
    if (patches.length > 0 || removed.length > 0 || addedEvent[0]?.exists) {
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
    const oneLine = value.replace(/\s+/g, " ");
    return oneLine.length > 100 ? `${oneLine.slice(0, 97)}...` : oneLine;
};

const titleFor = (row: StoredHistoryAction): string => {
    const data = asData(row.data);
    const patches = asPatch(row.data);
    const count = row.affectedCount;
    const noun = count === 1 ? "application" : "applications";
    const firstName = patches[0]?.n ?? data.n;
    switch (row.kind) {
        case HISTORY_KIND.create:
            return `Added ${firstName ?? "an application"}`;
        case HISTORY_KIND.import:
            return `Imported ${count.toLocaleString()} ${noun}`;
        case HISTORY_KIND.edit:
            return count === 1 && firstName
                ? `Edited ${firstName}`
                : `Edited ${count.toLocaleString()} ${noun}`;
        case HISTORY_KIND.status: {
            const status = patches[0]?.f.s?.[1];
            const destination = status
                ? displayValue("s", status)
                : "a new status";
            return count === 1 && firstName
                ? `Moved ${firstName} to ${destination}`
                : `Moved ${count.toLocaleString()} ${noun} to ${destination}`;
        }
        case HISTORY_KIND.arrangement: {
            const arrangement = patches[0]?.f.a?.[1] ?? null;
            const destination = displayValue("a", arrangement);
            return `Set ${count.toLocaleString()} ${noun} to ${destination}`;
        }
        case HISTORY_KIND.delete: {
            const deleted = data.d;
            const name = deleted?.[0]?.company_name;
            return count === 1 && name
                ? `Deleted ${name}`
                : `Deleted ${count.toLocaleString()} ${noun}`;
        }
        case HISTORY_KIND.list:
            return "Edited list details";
        case HISTORY_KIND.steps:
            return firstName
                ? `Edited ${firstName}'s status history`
                : "Edited status history";
        case HISTORY_KIND.undo:
            return data.n ? `Undid: ${data.n}` : "Undid a previous change";
        default:
            return "Changed this list";
    }
};

const changesFor = (row: StoredHistoryAction): string[] => {
    const data = asData(row.data);
    const patches = asPatch(row.data);
    const lines: string[] = [];
    for (const patch of patches) {
        for (const [code, values] of Object.entries(patch.f)) {
            const label = FIELD_LABELS[code as keyof typeof FIELD_MAP] ?? code;
            lines.push(
                `${patch.n}, ${label}: ${displayValue(code, values[0])} → ${displayValue(code, values[1])}`,
            );
            if (lines.length === 12) return lines;
        }
    }
    if (data.f) {
        const listLabels: Record<string, string> = {
            n: "Name",
            d: "Description",
            s: "Status",
        };
        for (const [code, values] of Object.entries(data.f)) {
            lines.push(
                `${listLabels[code] ?? code}: ${displayValue(code, values[0])} → ${displayValue(code, values[1])}`,
            );
        }
    }
    if (data.e?.length) {
        lines.push(
            `${data.e.length.toLocaleString()} status ${data.e.length === 1 ? "step" : "steps"} restored by undo`,
        );
    }
    return lines;
};

const toStored = (row: HistoryDatabaseRow): StoredHistoryAction => ({
    id: String(row.id),
    kind: row.kind,
    affectedCount: row.affectedCount,
    data: row.data,
    reversible: row.reversible,
    occurredAt: row.occurredAt.toISOString(),
    undoneAt: row.undoneAt?.toISOString() ?? null,
});

const toItem = (
    row: StoredHistoryAction,
    archived: boolean,
): ListHistoryItem => ({
    id: row.id,
    title: titleFor(row),
    changes: changesFor(row),
    occurredAt: row.occurredAt,
    when: formatRelative(new Date(row.occurredAt)),
    canUndo: row.reversible && !row.undoneAt && !archived,
    undone: row.undoneAt !== null,
    archived,
});

export const encodeHistoryActions = (actions: StoredHistoryAction[]): Buffer =>
    gzipSync(Buffer.from(JSON.stringify(actions)), { level: 9 });

export const decodeHistoryActions = (
    payload: Uint8Array,
): StoredHistoryAction[] => {
    const parsed: unknown = JSON.parse(gunzipSync(payload).toString("utf8"));
    if (!Array.isArray(parsed)) throw new Error("History archive is invalid.");
    return parsed as StoredHistoryAction[];
};

export const getListHistory = async (
    userId: string,
    listId: string,
    beforeId: string | null = null,
    pageSize = HISTORY_PAGE_SIZE,
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
    const items = combined
        .slice(0, limit)
        .map((action) => toItem(action, archivedIds.has(action.id)));
    return {
        items,
        nextCursor: items.at(-1)?.id ?? null,
        hasMore:
            combined.length > limit || archiveRowsRead === ARCHIVE_READ_LIMIT,
    };
};

const sameCurrentValues = (
    snapshot: ApplicationSnapshot,
    fields: FieldChanges,
): boolean =>
    Object.entries(fields).every(([code, values]) => {
        if (!(code in FIELD_MAP)) return false;
        return valueOf(snapshot, code as keyof typeof FIELD_MAP) === values[1];
    });

const applyInversePatches = async (
    client: QueryClient,
    userId: string,
    patches: ApplicationPatch[],
): Promise<void> => {
    const inverse = patches.map((patch) => ({
        i: patch.i,
        f: Object.fromEntries(
            Object.entries(patch.f).map(([code, values]) => [code, values[0]]),
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
        values: [JSON.stringify(inverse), userId],
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

export type UndoHistoryResult = { ok: true } | { ok: false; error: string };

export const undoHistoryAction = async (
    userId: string,
    listId: string,
    actionId: string,
): Promise<UndoHistoryResult> => {
    let recordedActionId: string | null = null;
    const result = await withTransaction<UndoHistoryResult>(async (client) => {
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
        if (!row) {
            return { ok: false, error: "That change is no longer undoable." };
        }
        if (!row.reversible || row.undoneAt) {
            return {
                ok: false,
                error: "That change has already been handled.",
            };
        }

        const data = asData(row.data);
        const originalTitle = titleFor(toStored(row));
        const undoId = await reserveActionId(client);
        if (
            row.kind === HISTORY_KIND.create ||
            row.kind === HISTORY_KIND.import
        ) {
            const [created] = await rowsOf<{
                total: number;
                changed: number;
            }>(
                client,
                `
                    select
                        count(*)::int as total,
                        count(*) filter (
                            where a.updated_at is distinct from a.created_at
                        )::int as changed
                    from applications a
                    join lists l on l.id = a.list_id
                    where a.list_id = $1
                        and l.user_id = $2
                        and a.created_by_history_action_id = $3::bigint
                `,
                [listId, userId, actionId],
            );
            if (
                (created?.total ?? 0) !== row.affectedCount ||
                (created?.changed ?? 0) > 0
            ) {
                return {
                    ok: false,
                    error: "One of those applications changed later. Undo its newer changes first.",
                };
            }
            await client.query({
                text: `
                    delete from applications a
                    using lists l
                    where a.list_id = l.id
                        and a.list_id = $1
                        and l.user_id = $2
                        and a.created_by_history_action_id = $3::bigint
                `,
                values: [listId, userId, actionId],
            });
        } else if (
            row.kind === HISTORY_KIND.edit ||
            row.kind === HISTORY_KIND.status ||
            row.kind === HISTORY_KIND.arrangement ||
            row.kind === HISTORY_KIND.steps
        ) {
            const patches = asPatch(row.data);
            const current = await applicationSnapshots(
                client,
                userId,
                patches.map((patch) => patch.i),
            );
            const currentById = new Map(current.map((item) => [item.id, item]));
            const conflict = patches.some((patch) => {
                const snapshot = currentById.get(patch.i);
                return !snapshot || !sameCurrentValues(snapshot, patch.f);
            });
            if (conflict) {
                return {
                    ok: false,
                    error: "A newer change touches the same field. Undo that change first.",
                };
            }
            if (patches.length > 0) {
                await applyInversePatches(client, userId, patches);
            }
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
            if (data.e) await restoreEvents(client, userId, data.e);
        } else if (row.kind === HISTORY_KIND.delete) {
            const deleted = data.d ?? [];
            const ids = deleted.map((application) => application.id);
            if (ids.length === 0) {
                return { ok: false, error: "The deleted data is unavailable." };
            }
            const existing = await applicationSnapshots(client, userId, ids);
            if (existing.length > 0) {
                return {
                    ok: false,
                    error: "An application with the same ID already exists.",
                };
            }
            await restoreApplications(client, userId, listId, deleted);
            if (data.e) await restoreEvents(client, userId, data.e);
        } else if (row.kind === HISTORY_KIND.list) {
            const current = await listSnapshot(client, userId, listId);
            const fields = data.f ?? {};
            const currentValues: Record<string, Scalar> = {
                n: current?.name ?? null,
                d: current?.description ?? null,
                s: current?.status ?? null,
            };
            if (
                !current ||
                Object.entries(fields).some(
                    ([code, values]) => currentValues[code] !== values[1],
                )
            ) {
                return {
                    ok: false,
                    error: "The list changed again. Undo that newer change first.",
                };
            }
            await client.query({
                text: `
                    update lists l
                    set
                        name = case when $1 then $2 else l.name end,
                        description = case when $3 then $4 else l.description end,
                        status = case when $5
                            then $6::list_status else l.status end
                    where l.id = $7 and l.user_id = $8
                `,
                values: [
                    "n" in fields,
                    fields.n?.[0] ?? null,
                    "d" in fields,
                    fields.d?.[0] ?? null,
                    "s" in fields,
                    fields.s?.[0] ?? "active",
                    listId,
                    userId,
                ],
            });
        } else {
            return { ok: false, error: "That change cannot be undone." };
        }

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
            affectedCount: row.affectedCount,
            data: { o: actionId, n: originalTitle },
            reversible: false,
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
