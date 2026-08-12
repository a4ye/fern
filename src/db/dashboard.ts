import { getPool } from "@/db/client";
import * as gen from "@/db/queries";
import {
    ACTIVE_STATUSES,
    INTERVIEWING_STATUSES,
    OFFER_STATUSES,
    STATUS_META,
    formatPay,
    formatRelative,
    toDateInput,
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

// The column set shared by insert and update, minus pay, which only some of
// them write.
const columnsFrom = (input: ApplicationInput) => ({
    companyName: input.company,
    roleTitle: input.role,
    status: input.status,
    url: input.url,
    location: input.location,
    arrangement: input.arrangement,
    appliedAt: parseDateInput(input.appliedAt),
});

export const createApplication = async (
    userId: string,
    listId: string,
    input: ApplicationInput,
): Promise<boolean> => {
    const row = await gen.createApplication(getPool(), {
        userId,
        listId,
        ...columnsFrom(input),
        ...parsePay(input.pay),
    });
    return row !== null;
};

// One row of the quick edit grid. `payTyped` says whether the pay box was
// actually edited: the grid holds pay as one line of text, so writing it back
// when it was only sitting there would flatten a range, currency and note the
// detail panel had set.
const updateApplication = async (
    userId: string,
    applicationId: string,
    input: ApplicationInput,
    payTyped: boolean,
): Promise<void> => {
    const pool = getPool();
    const current = await gen.getApplicationForUser(pool, {
        applicationId,
        userId,
    });
    if (!current) return;

    const columns = { applicationId, userId, ...columnsFrom(input) };
    if (payTyped) {
        await gen.updateApplication(pool, {
            ...columns,
            ...parsePay(input.pay),
        });
    } else {
        await gen.updateApplicationFields(pool, columns);
    }

    if (current.status !== input.status) {
        await gen.insertApplicationEvent(pool, {
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
): Promise<void> => {
    for (const row of rows) {
        await updateApplication(userId, row.id, row.input, row.payTyped);
    }
};

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

export const saveApplicationDetail = async (
    userId: string,
    applicationId: string,
    detail: ApplicationDetail,
): Promise<void> => {
    await gen.updateApplicationDetail(getPool(), {
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

// Records a step in the history and leaves the application sitting at it. The
// status it already holds is a valid step: that is how a second interview is
// logged, and the chart draws it as a round of its own.
export const logStatusStep = async (
    userId: string,
    applicationId: string,
    status: ApplicationStatus,
): Promise<void> => {
    const pool = getPool();
    const current = await gen.getApplicationForUser(pool, {
        applicationId,
        userId,
    });
    if (!current) return;

    await gen.insertApplicationEvent(pool, {
        applicationId,
        fromStatus: current.status,
        toStatus: status,
        note: null,
    });
    await gen.setApplicationStatus(pool, { applicationId, userId, status });
};

// Takes back a recorded step, so removing the one just logged is an undo. The
// application is left where the last remaining step put it, or, when that was
// the only step, back where the step came from.
export const removeStatusStep = async (
    userId: string,
    applicationId: string,
    eventId: string,
): Promise<void> => {
    const pool = getPool();
    const steps = await gen.statusEventsForApplication(pool, {
        applicationId,
        userId,
    });
    const removed = steps.find((step) => step.id === eventId);
    if (!removed) return;

    await gen.deleteApplicationEvent(pool, { eventId, applicationId, userId });

    const remaining = steps.filter((step) => step.id !== eventId);
    const status =
        remaining[remaining.length - 1]?.toStatus ?? removed.fromStatus;
    if (status) {
        await gen.setApplicationStatus(pool, {
            applicationId,
            userId,
            status,
        });
    }
};

export const setApplicationsStatus = async (
    userId: string,
    applicationIds: string[],
    status: ApplicationStatus,
): Promise<void> => {
    const pool = getPool();
    const args = { applicationIds, userId, status };
    await gen.insertStatusEvents(pool, args);
    await gen.setApplicationsStatus(pool, args);
};

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
            notes: row.notes,
            history: historyOf(row.id, status),
            updated: formatRelative(row.updatedAt),
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

    const flow: FlowEntry[] = applications.map((app) => ({
        status: app.status,
        history: app.history.map((step) => step.status),
    }));

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
