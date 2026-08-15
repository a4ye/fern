import type { PoolClient } from "@neondatabase/serverless";
import { getPool, withTransaction } from "@/db/client";
import * as gen from "@/db/queries";
import {
    ACTIVE_STATUSES,
    INTERVIEWING_STATUSES,
    OFFER_STATUSES,
    STATUS_META,
    formatPay,
    formatRelative,
    toDateInput,
    type ApplicationExtras,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
    type ActivityItem,
    type FlowEntry,
    type ListDetail,
    type ListSort,
    type ListStatus,
    type ListSummary,
    type PayPeriod,
    type PipelineEntry,
    type StatusStep,
    type Stat,
} from "@/components/dashboard/data";
import { parsePay } from "@/lib/pay";

const STATUS_ORDER = Object.keys(STATUS_META) as ApplicationStatus[];

export type ListsPage = {
    lists: ListSummary[];
    total: number;
    page: number;
    pageCount: number;
};

export const getListsForUser = async (
    userId: string,
    options: { search: string; sort: ListSort; page: number; pageSize: number },
): Promise<ListsPage> => {
    const pool = getPool();
    const count = await gen.countListsForUser(pool, {
        userId,
        search: options.search,
    });
    const total = count?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / options.pageSize));
    const page = Math.min(Math.max(1, options.page), pageCount);

    const rows = await gen.listListsForUser(pool, {
        userId,
        search: options.search,
        sort: options.sort,
        pageLimit: options.pageSize,
        pageOffset: (page - 1) * options.pageSize,
    });
    return {
        lists: rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            status: row.status as ListStatus,
            pinned: row.pinnedAt !== null,
            updatedAt: row.updatedAt.toISOString(),
            totalApplications: row.totalApplications,
        })),
        total,
        page,
        pageCount,
    };
};

export const createList = async (
    userId: string,
    name: string,
    description: string | null,
): Promise<ListSummary> => {
    const row = await gen.createList(getPool(), { userId, name, description });
    if (!row) throw new Error("Failed to create list");
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status as ListStatus,
        pinned: row.pinnedAt !== null,
        updatedAt: row.updatedAt.toISOString(),
        totalApplications: 0,
    };
};

export type ApplicationInput = {
    company: string;
    role: string | null;
    status: ApplicationStatus;
    location: string | null;
    arrangement: Arrangement | null;
    pay: string | null;
    appliedAt: string | null;
    url: string | null;
};

// Builds the Date from the parts so the driver sends the day the user picked,
// rather than the UTC instant that a yyyy-mm-dd string parses to.
const parseDateInput = (value: string | null): Date | null => {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
};

// The columns an update writes, minus pay, which only some of them write.
const columnsFrom = (input: ApplicationInput, timeZone: string) => ({
    companyName: input.company,
    roleTitle: input.role,
    status: input.status,
    url: input.url,
    location: input.location,
    arrangement: input.arrangement,
    appliedAt: parseDateInput(input.appliedAt),
    timeZone,
});

export const createApplication = async (
    userId: string,
    listId: string,
    input: ApplicationDetail & { status: ApplicationStatus },
    timeZone: string,
): Promise<boolean> => {
    const row = await gen.createApplication(getPool(), {
        userId,
        listId,
        companyName: input.company,
        roleTitle: input.role,
        status: input.status,
        url: input.url,
        location: input.location,
        arrangement: input.arrangement,
        appliedAt: parseDateInput(input.appliedAt),
        timeZone,
        payMin: input.payMin,
        payMax: input.payMax,
        payCurrency: input.payCurrency,
        payPeriod: input.payPeriod,
        bonusAmount: input.bonus,
        payNote: input.payNote,
        notes: input.notes,
    });
    return row !== null;
};

// One row of the quick edit grid. `payTyped` says whether the pay box was
// actually edited: the grid holds pay as one line of text, so writing it back
// when it was only sitting there would flatten a range, currency and note the
// detail panel had set.
const updateApplication = async (
    client: PoolClient,
    userId: string,
    applicationId: string,
    input: ApplicationInput,
    payTyped: boolean,
    timeZone: string,
): Promise<void> => {
    const current = await gen.getApplicationForUser(client, {
        applicationId,
        userId,
    });
    if (!current) return;

    const columns = {
        applicationId,
        userId,
        ...columnsFrom(input, timeZone),
    };
    if (payTyped) {
        await gen.updateApplication(client, {
            ...columns,
            ...parsePay(input.pay),
        });
    } else {
        await gen.updateApplicationFields(client, columns);
    }

    if (current.status !== input.status) {
        await gen.insertApplicationEvent(client, {
            applicationId,
            fromStatus: current.status,
            toStatus: input.status,
            note: null,
        });
    }
};

export const updateApplications = async (
    userId: string,
    rows: { id: string; input: ApplicationInput; payTyped: boolean }[],
    timeZone: string,
): Promise<void> =>
    withTransaction(async (client) => {
        // A stable lock order prevents two overlapping bulk edits from taking
        // the same application locks in opposite orders.
        const orderedRows = [...rows].sort((left, right) =>
            left.id.localeCompare(right.id),
        );
        for (const row of orderedRows) {
            await updateApplication(
                client,
                userId,
                row.id,
                row.input,
                row.payTyped,
                timeZone,
            );
        }
    });

// Everything the detail panel edits. Amounts are decimal strings, since that is
// how numeric columns arrive and leave, and rounding them through a float would
// lose cents.
export type ApplicationDetail = {
    company: string;
    role: string | null;
    location: string | null;
    arrangement: Arrangement | null;
    appliedAt: string | null;
    url: string | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    bonus: string | null;
    payNote: string | null;
    notes: string | null;
};

const saveApplicationDetailWithClient = async (
    client: PoolClient,
    userId: string,
    applicationId: string,
    detail: ApplicationDetail,
): Promise<void> => {
    await gen.updateApplicationDetail(client, {
        applicationId,
        userId,
        companyName: detail.company,
        roleTitle: detail.role,
        url: detail.url,
        location: detail.location,
        arrangement: detail.arrangement,
        appliedAt: parseDateInput(detail.appliedAt),
        payMin: detail.payMin,
        payMax: detail.payMax,
        payCurrency: detail.payCurrency,
        payPeriod: detail.payPeriod,
        bonusAmount: detail.bonus,
        payNote: detail.payNote,
        notes: detail.notes,
    });
};

export const saveApplicationDetail = async (
    userId: string,
    applicationId: string,
    detail: ApplicationDetail,
): Promise<void> =>
    withTransaction((client) =>
        saveApplicationDetailWithClient(client, userId, applicationId, detail),
    );

// Records a step in the history and leaves the application sitting at it. The
// status it already holds is a valid step: that is how a second interview is
// logged, and the chart draws it as a round of its own.
const logStatusStepWithClient = async (
    client: PoolClient,
    userId: string,
    applicationId: string,
    status: ApplicationStatus,
    timeZone: string,
): Promise<void> => {
    const current = await gen.getApplicationForUser(client, {
        applicationId,
        userId,
    });
    if (!current) return;

    await gen.insertApplicationEvent(client, {
        applicationId,
        fromStatus: current.status,
        toStatus: status,
        note: null,
    });
    await gen.setApplicationStatus(client, {
        applicationId,
        userId,
        status,
        timeZone,
    });
};

export const logStatusStep = async (
    userId: string,
    applicationId: string,
    status: ApplicationStatus,
    timeZone: string,
): Promise<void> =>
    withTransaction((client) =>
        logStatusStepWithClient(
            client,
            userId,
            applicationId,
            status,
            timeZone,
        ),
    );

const removeStatusStepWithClient = async (
    client: PoolClient,
    userId: string,
    applicationId: string,
    eventId: string,
    timeZone: string,
): Promise<void> => {
    const steps = await gen.statusEventsForApplication(client, {
        applicationId,
        userId,
    });
    if (!steps.some((step) => step.id === eventId)) return;

    await gen.deleteApplicationEvent(client, {
        eventId,
        applicationId,
        userId,
    });

    const remaining = steps.filter((step) => step.id !== eventId);
    await gen.setApplicationStatus(client, {
        applicationId,
        userId,
        status: remaining[remaining.length - 1]?.toStatus ?? "not_applied",
        timeZone,
    });
};

// The detail panel's staged history edits, applied on save. Drops come first so
// a step removed and re-recorded in the same edit still ends up last, which is
// where the application is left sitting.
const applyStatusStepEditsWithClient = async (
    client: PoolClient,
    userId: string,
    applicationId: string,
    edits: { removed: string[]; added: ApplicationStatus[] },
    timeZone: string,
): Promise<void> => {
    // Lock the application before touching its history so another request
    // cannot add a step between reading the history and updating the status.
    const application = await gen.getApplicationForUser(client, {
        applicationId,
        userId,
    });
    if (!application) return;

    for (const eventId of edits.removed) {
        await removeStatusStepWithClient(
            client,
            userId,
            applicationId,
            eventId,
            timeZone,
        );
    }
    for (const status of edits.added) {
        await logStatusStepWithClient(
            client,
            userId,
            applicationId,
            status,
            timeZone,
        );
    }
};

export const applyStatusStepEdits = async (
    userId: string,
    applicationId: string,
    edits: { removed: string[]; added: ApplicationStatus[] },
    timeZone: string,
): Promise<void> =>
    withTransaction((client) =>
        applyStatusStepEditsWithClient(
            client,
            userId,
            applicationId,
            edits,
            timeZone,
        ),
    );

export const saveApplicationDetailAndSteps = async (
    userId: string,
    applicationId: string,
    detail: ApplicationDetail,
    edits: { removed: string[]; added: ApplicationStatus[] },
    timeZone: string,
): Promise<void> =>
    withTransaction(async (client) => {
        await saveApplicationDetailWithClient(
            client,
            userId,
            applicationId,
            detail,
        );
        await applyStatusStepEditsWithClient(
            client,
            userId,
            applicationId,
            edits,
            timeZone,
        );
    });

// Takes back a recorded step, so removing the one just logged is an undo. The
// application is left where the last remaining step put it, and with no steps
// left there is nothing saying it ever moved, so it goes back to the start.
export const removeStatusStep = async (
    userId: string,
    applicationId: string,
    eventId: string,
    timeZone: string,
): Promise<void> =>
    withTransaction(async (client) => {
        const application = await gen.getApplicationForUser(client, {
            applicationId,
            userId,
        });
        if (!application) return;
        await removeStatusStepWithClient(
            client,
            userId,
            applicationId,
            eventId,
            timeZone,
        );
    });

export const setApplicationsStatus = async (
    userId: string,
    applicationIds: string[],
    status: ApplicationStatus,
    timeZone: string,
): Promise<void> =>
    withTransaction(async (client) => {
        const args = { applicationIds, userId, status, timeZone };
        await gen.lockApplicationsForUser(client, {
            applicationIds,
            userId,
        });
        await gen.insertStatusEvents(client, args);
        await gen.setApplicationsStatus(client, args);
    });

export const setApplicationsArrangement = async (
    userId: string,
    applicationIds: string[],
    arrangement: Arrangement | null,
): Promise<void> => {
    await gen.setApplicationsArrangement(getPool(), {
        applicationIds,
        userId,
        arrangement,
    });
};

export const deleteApplication = async (
    userId: string,
    applicationId: string,
): Promise<void> => {
    await gen.deleteApplication(getPool(), { applicationId, userId });
};

export const deleteApplications = async (
    userId: string,
    applicationIds: string[],
): Promise<void> => {
    await gen.deleteApplications(getPool(), { applicationIds, userId });
};

export const updateList = async (
    userId: string,
    listId: string,
    input: { name: string; description: string | null; status: ListStatus },
): Promise<boolean> => {
    const row = await gen.updateList(getPool(), {
        id: listId,
        userId,
        name: input.name,
        description: input.description,
        status: input.status,
    });
    return row !== null;
};

export const setListPinned = async (
    userId: string,
    listId: string,
    pinned: boolean,
): Promise<void> => {
    const args = { id: listId, userId };
    if (pinned) {
        await gen.setListPinned(getPool(), args);
    } else {
        await gen.setListUnpinned(getPool(), args);
    }
};

export const deleteList = async (
    userId: string,
    listId: string,
): Promise<void> => {
    await gen.deleteList(getPool(), { id: listId, userId });
};

export const getListDetail = async (
    userId: string,
    listId: string,
): Promise<ListDetail | null> => {
    const pool = getPool();
    const list = await gen.getListForUser(pool, { id: listId, userId });
    if (!list) return null;

    const [applicationRows, pipelineRows, eventRows, statusEventRows] =
        await Promise.all([
            gen.listApplicationsForList(pool, { listId }),
            gen.pipelineForList(pool, { listId }),
            gen.recentEventsForList(pool, { listId }),
            gen.statusEventsForList(pool, { listId }),
        ]);

    // Rows arrive ordered by application and time, so appending each event's
    // target status replays the trail. The first event also contributes where it
    // started from, which is the only record of the status on creation and so
    // the one step with no event of its own to take back.
    const trails = new Map<string, StatusStep[]>();
    for (const row of statusEventRows) {
        let trail = trails.get(row.applicationId);
        if (!trail) {
            trail = [];
            trails.set(row.applicationId, trail);
            if (row.fromStatus) {
                trail.push({
                    id: null,
                    status: row.fromStatus as ApplicationStatus,
                    at: null,
                });
            }
        }
        if (row.toStatus) {
            trail.push({
                id: row.id,
                status: row.toStatus as ApplicationStatus,
                at: row.occurredAt.toISOString(),
            });
        }
    }

    // Where the application sits now always ends the trail, even when it got
    // there without a step being recorded, which is how one that never moved
    // still has a history of one.
    const historyOf = (id: string, status: ApplicationStatus): StatusStep[] => {
        const trail = trails.get(id) ?? [];
        if (trail[trail.length - 1]?.status === status) return trail;
        return [...trail, { id: null, status, at: null }];
    };

    const applications: ApplicationRow[] = applicationRows.map((row) => {
        const status = row.status as ApplicationStatus;
        return {
            id: row.id,
            company: row.companyName,
            role: row.roleTitle,
            status,
            pay: formatPay({
                payMin: row.payMin,
                payMax: row.payMax,
                payCurrency: row.payCurrency,
                payPeriod: row.payPeriod as PayPeriod | null,
                payNote: row.payNote,
            }),
            payNote: row.payNote,
            payMin: row.payMin,
            payMax: row.payMax,
            payCurrency: row.payCurrency,
            payPeriod: row.payPeriod as PayPeriod | null,
            bonus: row.bonusAmount,
            location: row.location,
            arrangement: row.arrangement as Arrangement | null,
            appliedAt: row.appliedAt ? toDateInput(row.appliedAt) : null,
            url: row.url,
            updated: formatRelative(row.updatedAt),
            updatedAt: row.updatedAt.toISOString(),
        };
    });

    const counts = new Map<ApplicationStatus, number>();
    for (const row of pipelineRows) {
        counts.set(row.status as ApplicationStatus, row.count);
    }
    const sumOf = (statuses: ApplicationStatus[]): number =>
        statuses.reduce(
            (total, status) => total + (counts.get(status) ?? 0),
            0,
        );

    const pipeline: PipelineEntry[] = STATUS_ORDER.filter((status) =>
        counts.has(status),
    ).map((status) => ({ status, count: counts.get(status) as number }));

    // Read from the trails rather than from the rows, which no longer carry
    // their history: the chart wants the path each application took, and only
    // the statuses along it, not the steps that recorded them.
    const flow: FlowEntry[] = applicationRows.map((row) => {
        const status = row.status as ApplicationStatus;
        return {
            status,
            history: historyOf(row.id, status).map((step) => step.status),
        };
    });

    const stats: Stat[] = [
        { label: "Total", value: String(applications.length) },
        { label: "Active", value: String(sumOf(ACTIVE_STATUSES)) },
        { label: "Interviewing", value: String(sumOf(INTERVIEWING_STATUSES)) },
        { label: "Offers", value: String(sumOf(OFFER_STATUSES)) },
    ];

    const activity: ActivityItem[] = eventRows.map((row, index) => ({
        id: `${row.companyName}-${row.occurredAt.getTime()}-${index}`,
        company: row.companyName,
        toStatus: row.toStatus ? (row.toStatus as ApplicationStatus) : null,
        note: row.note,
        when: formatRelative(row.occurredAt),
    }));

    return {
        id: list.id,
        name: list.name,
        description: list.description,
        status: list.status as ListStatus,
        stats,
        applications,
        pipeline,
        flow,
        activity,
    };
};

// The parts of an application the table leaves behind, fetched when one row is
// opened. Returns null when the application is not this user's, which is the
// same answer as one that does not exist.
export const getApplicationExtras = async (
    userId: string,
    applicationId: string,
): Promise<ApplicationExtras | null> => {
    const pool = getPool();
    const [detail, eventRows] = await Promise.all([
        gen.applicationDetailForUser(pool, { applicationId, userId }),
        gen.statusEventsForApplication(pool, { applicationId, userId }),
    ]);
    if (!detail) return null;

    // The same replay the list does, over one application's events: the first
    // event also contributes where it started from, which is the only record of
    // the status it was created with.
    const history: StatusStep[] = [];
    for (const [index, row] of eventRows.entries()) {
        if (index === 0 && row.fromStatus) {
            history.push({
                id: null,
                status: row.fromStatus as ApplicationStatus,
                at: null,
            });
        }
        if (row.toStatus) {
            history.push({
                id: row.id,
                status: row.toStatus as ApplicationStatus,
                at: row.occurredAt.toISOString(),
            });
        }
    }

    return { notes: detail.notes, history };
};
