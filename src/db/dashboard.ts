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

// The column set shared by insert and update, including pay split out of the
// free-text field the user types.
const columnsFrom = (input: ApplicationInput) => ({
    companyName: input.company,
    roleTitle: input.role,
    status: input.status,
    url: input.url,
    location: input.location,
    arrangement: input.arrangement,
    appliedAt: parseDateInput(input.appliedAt),
    ...parsePay(input.pay),
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
    });
    return row !== null;
};

export const updateApplication = async (
    userId: string,
    applicationId: string,
    input: ApplicationInput,
): Promise<void> => {
    const pool = getPool();
    const current = await gen.getApplicationForUser(pool, {
        applicationId,
        userId,
    });
    if (!current) return;

    await gen.updateApplication(pool, {
        applicationId,
        userId,
        ...columnsFrom(input),
    });

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
    rows: { id: string; input: ApplicationInput }[],
): Promise<void> => {
    for (const row of rows) {
        await updateApplication(userId, row.id, row.input);
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

    const applications: ApplicationRow[] = applicationRows.map((row) => ({
        id: row.id,
        company: row.companyName,
        role: row.roleTitle,
        status: row.status as ApplicationStatus,
        pay: formatPay({
            payMin: row.payMin,
            payMax: row.payMax,
            payCurrency: row.payCurrency,
            payPeriod: row.payPeriod as PayPeriod | null,
            payNote: row.payNote,
        }),
        payNote: row.payNote,
        location: row.location,
        arrangement: row.arrangement as Arrangement | null,
        appliedAt: row.appliedAt ? toDateInput(row.appliedAt) : null,
        url: row.url,
        notes: row.notes,
        updated: formatRelative(row.updatedAt),
    }));

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

    // Rows arrive ordered by application and time, so appending each event's
    // target status replays the trail. The first event also contributes where
    // it started from, which is the only record of the status on creation.
    const trails = new Map<string, ApplicationStatus[]>();
    for (const row of statusEventRows) {
        let trail = trails.get(row.applicationId);
        if (!trail) {
            trail = [];
            trails.set(row.applicationId, trail);
            if (row.fromStatus) trail.push(row.fromStatus as ApplicationStatus);
        }
        if (row.toStatus) trail.push(row.toStatus as ApplicationStatus);
    }

    const flow: FlowEntry[] = applicationRows.map((row) => {
        const status = row.status as ApplicationStatus;
        const history = [...(trails.get(row.id) ?? [])];
        if (history[history.length - 1] !== status) history.push(status);
        return { status, history };
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
