import { getPool } from "@/db/client";
import * as gen from "@/db/queries";
import {
    ACTIVE_STATUSES,
    INTERVIEWING_STATUSES,
    OFFER_STATUSES,
    STATUS_META,
    formatPay,
    formatRelative,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
    type ActivityItem,
    type ListDetail,
    type ListSort,
    type ListStatus,
    type ListSummary,
    type PayPeriod,
    type PipelineEntry,
    type Stat,
} from "@/components/dashboard/data";

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

export const createApplication = async (
    userId: string,
    listId: string,
    input: {
        company: string;
        role: string | null;
        url: string | null;
        location: string | null;
        pay: string | null;
    },
): Promise<boolean> => {
    const row = await gen.createApplication(getPool(), {
        userId,
        listId,
        companyName: input.company,
        roleTitle: input.role,
        url: input.url,
        location: input.location,
        payNote: input.pay,
    });
    return row !== null;
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

    const [applicationRows, pipelineRows, eventRows] = await Promise.all([
        gen.listApplicationsForList(pool, { listId }),
        gen.pipelineForList(pool, { listId }),
        gen.recentEventsForList(pool, { listId }),
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
        location: row.location,
        arrangement: row.arrangement as Arrangement | null,
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

    const total = applications.length;
    const stats: Stat[] = [
        { label: "Total", value: String(total), detail: "applications" },
        {
            label: "Active",
            value: String(sumOf(ACTIVE_STATUSES)),
            detail: "in the pipeline",
        },
        {
            label: "Interviewing",
            value: String(sumOf(INTERVIEWING_STATUSES)),
            detail: "in progress",
        },
        {
            label: "Offers",
            value: String(sumOf(OFFER_STATUSES)),
            detail: "on the table",
        },
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
        activity,
    };
};
