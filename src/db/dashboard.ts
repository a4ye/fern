import type { PoolClient } from "@neondatabase/serverless";
import { getPool } from "@/db/client";
import * as gen from "@/db/queries";
import {
    HISTORY_KIND,
    recordApplicationChange,
    recordCreatedApplications,
    recordDeletedApplications,
    recordListChange,
} from "@/db/history";
import {
    ACTIVE_STATUSES,
    INTERVIEWING_STATUSES,
    OFFER_STATUSES,
    formatPay,
    formatRelative,
    toDateInput,
    type ApplicationExtras,
    type ApplicationRow,
    type ApplicationStatus,
    type Arrangement,
    type FlowEntry,
    type ListDetail,
    type ListInsightsData,
    type ListSort,
    type ListStatus,
    type ListSummary,
    type PayPeriod,
    type StatusStep,
    type Stat,
} from "@/components/dashboard/data";
import {
    funnelFrom,
    volumeFrom,
    wasSent,
} from "@/components/dashboard/insights";
import { placesFrom } from "@/lib/application-places";
import { parsePay } from "@/lib/pay";
import {
    MAX_APPLICATIONS_READ_PER_LIST,
    MAX_EVENTS_READ_PER_APPLICATION,
} from "@/lib/limits";

type QueryClient = Pick<PoolClient, "query">;

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
    const requestedPage = Math.max(1, options.page);
    const loadPage = (page: number) =>
        gen.listsPageForUser(pool, {
            userId,
            search: options.search,
            sort: options.sort,
            pageLimit: options.pageSize,
            pageOffset: (page - 1) * options.pageSize,
        });

    let rows = await loadPage(requestedPage);
    const total = rows[0]?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / options.pageSize));
    const page = Math.min(requestedPage, pageCount);

    if (page !== requestedPage) rows = await loadPage(page);
    return {
        lists: rows.flatMap((row) =>
            row.id &&
            row.name &&
            row.status &&
            row.updatedAt &&
            row.totalApplications !== null
                ? [
                      {
                          id: row.id,
                          name: row.name,
                          description: row.description,
                          status: row.status as ListStatus,
                          pinned: row.pinnedAt !== null,
                          updatedAt: row.updatedAt.toISOString(),
                          totalApplications: row.totalApplications,
                      },
                  ]
                : [],
        ),
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

export const createApplication = async (
    userId: string,
    listId: string,
    input: ApplicationDetail & { status: ApplicationStatus },
    timeZone: string,
): Promise<boolean> =>
    recordCreatedApplications({
        userId,
        listId,
        kind: HISTORY_KIND.create,
        name: input.company,
        mutation: async (client, historyActionId) => {
            const row = await gen.createApplication(client, {
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
                historyActionId,
            });
            return { result: row !== null, affectedCount: row ? 1 : 0 };
        },
    });

// Rows read out of a spreadsheet, written by one statement. A query per row
// would be a network round trip per row with a transaction held open across all
// of them, which is the whole cost of an import and grows with the file.
//
// The date goes over as the yyyy-mm-dd the sheet was read into rather than as a
// Date, so the day cannot move in serialization. Everything else is text for the
// same reason: one JSON parameter that the database casts, rather than fourteen
// arrays that have to stay in step.
export const importApplications = async (
    userId: string,
    listId: string,
    rows: (ApplicationInput & { notes: string | null })[],
    timeZone: string,
    defaultCurrency: string,
): Promise<number> => {
    if (rows.length === 0) return 0;

    const payload = rows.map((row, offset) => {
        const pay = parsePay(row.pay, defaultCurrency);
        return {
            offset,
            company_name: row.company,
            role_title: row.role,
            status: row.status,
            url: row.url,
            location: row.location,
            arrangement: row.arrangement,
            applied_at: row.appliedAt,
            pay_min: pay.payMin,
            pay_max: pay.payMax,
            pay_currency: pay.payCurrency,
            pay_period: pay.payPeriod,
            pay_note: pay.payNote,
            notes: row.notes,
        };
    });

    return recordCreatedApplications({
        userId,
        listId,
        kind: HISTORY_KIND.import,
        mutation: async (client, historyActionId) => {
            const inserted = await gen.createApplications(client, {
                userId,
                listId,
                timeZone,
                historyActionId,
                rows: JSON.stringify(payload),
            });
            return {
                result: inserted.length,
                affectedCount: inserted.length,
            };
        },
    });
};

export const updateApplications = async (
    userId: string,
    rows: { id: string; input: ApplicationInput; payTyped: boolean }[],
    timeZone: string,
    defaultCurrency: string,
): Promise<void> => {
    if (rows.length === 0) return;

    const payload = rows.map((row) => {
        const pay = row.payTyped
            ? parsePay(row.input.pay, defaultCurrency)
            : null;
        return {
            id: row.id,
            company_name: row.input.company,
            role_title: row.input.role,
            status: row.input.status,
            url: row.input.url,
            location: row.input.location,
            arrangement: row.input.arrangement,
            applied_at: row.input.appliedAt,
            pay_typed: row.payTyped,
            pay_min: pay?.payMin ?? null,
            pay_max: pay?.payMax ?? null,
            pay_currency: pay?.payCurrency ?? null,
            pay_period: pay?.payPeriod ?? null,
            pay_note: pay?.payNote ?? null,
        };
    });

    await recordApplicationChange({
        userId,
        applicationIds: rows.map((row) => row.id),
        kind: HISTORY_KIND.edit,
        mutation: (client, historyActionId) =>
            gen.updateApplicationsBulk(client, {
                rows: JSON.stringify(payload),
                userId,
                timeZone,
                historyActionId,
            }),
    });
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

const saveApplicationDetailWithClient = async (
    client: QueryClient,
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
    recordApplicationChange({
        userId,
        applicationIds: [applicationId],
        kind: HISTORY_KIND.edit,
        mutation: (client) =>
            saveApplicationDetailWithClient(
                client,
                userId,
                applicationId,
                detail,
            ),
    });

// Records a step in the history and leaves the application sitting at it. The
// status it already holds is a valid step: that is how a second interview is
// logged, and the chart draws it as a round of its own.
export const logStatusStep = async (
    userId: string,
    applicationId: string,
    status: ApplicationStatus,
    timeZone: string,
): Promise<void> => {
    await recordApplicationChange({
        userId,
        applicationIds: [applicationId],
        kind: HISTORY_KIND.steps,
        mutation: (client, historyActionId) =>
            gen.applyStatusStepEdits(client, {
                applicationId,
                userId,
                removedEventIds: [],
                addedStatuses: [status],
                timeZone,
                historyActionId,
            }),
    });
};

// The detail panel's staged history edits, applied on save. Drops come first so
// a step removed and re-recorded in the same edit still ends up last, which is
// where the application is left sitting.
const applyStatusStepEditsWithClient = async (
    client: QueryClient,
    userId: string,
    applicationId: string,
    edits: { removed: string[]; added: ApplicationStatus[] },
    timeZone: string,
    historyActionId: string,
): Promise<void> => {
    if (edits.removed.length === 0 && edits.added.length === 0) return;
    await gen.applyStatusStepEdits(client, {
        applicationId,
        userId,
        removedEventIds: edits.removed,
        addedStatuses: edits.added,
        timeZone,
        historyActionId,
    });
};

export const applyStatusStepEdits = async (
    userId: string,
    applicationId: string,
    edits: { removed: string[]; added: ApplicationStatus[] },
    timeZone: string,
): Promise<void> => {
    if (edits.removed.length === 0 && edits.added.length === 0) return;
    await recordApplicationChange({
        userId,
        applicationIds: [applicationId],
        kind: HISTORY_KIND.steps,
        trackRemovedEvents: edits.removed.length > 0,
        mutation: (client, historyActionId) =>
            applyStatusStepEditsWithClient(
                client,
                userId,
                applicationId,
                edits,
                timeZone,
                historyActionId,
            ),
    });
};

export const saveApplicationDetailAndSteps = async (
    userId: string,
    applicationId: string,
    detail: ApplicationDetail,
    edits: { removed: string[]; added: ApplicationStatus[] },
    timeZone: string,
): Promise<void> => {
    const hasStepEdits = edits.removed.length > 0 || edits.added.length > 0;
    await recordApplicationChange({
        userId,
        applicationIds: [applicationId],
        kind: hasStepEdits ? HISTORY_KIND.steps : HISTORY_KIND.edit,
        trackRemovedEvents: edits.removed.length > 0,
        mutation: async (client, historyActionId) => {
            await saveApplicationDetailWithClient(
                client,
                userId,
                applicationId,
                detail,
            );
            if (hasStepEdits) {
                await applyStatusStepEditsWithClient(
                    client,
                    userId,
                    applicationId,
                    edits,
                    timeZone,
                    historyActionId,
                );
            }
        },
    });
};

// Takes back a recorded step, so removing the one just logged is an undo. The
// application is left where the last remaining step put it, and with no steps
// left there is nothing saying it ever moved, so it goes back to the start.
export const removeStatusStep = async (
    userId: string,
    applicationId: string,
    eventId: string,
    timeZone: string,
): Promise<void> => {
    await recordApplicationChange({
        userId,
        applicationIds: [applicationId],
        kind: HISTORY_KIND.steps,
        trackRemovedEvents: true,
        mutation: (client, historyActionId) =>
            gen.applyStatusStepEdits(client, {
                applicationId,
                userId,
                removedEventIds: [eventId],
                addedStatuses: [],
                timeZone,
                historyActionId,
            }),
    });
};

export const setApplicationsStatus = async (
    userId: string,
    applicationIds: string[],
    status: ApplicationStatus,
    timeZone: string,
): Promise<void> =>
    recordApplicationChange({
        userId,
        applicationIds,
        kind: HISTORY_KIND.status,
        mutation: async (client, historyActionId) => {
            const args = {
                applicationIds,
                userId,
                status,
                timeZone,
                historyActionId,
            };
            await gen.lockApplicationsForUser(client, {
                applicationIds,
                userId,
            });
            await gen.insertStatusEvents(client, args);
            await gen.setApplicationsStatus(client, args);
        },
    });

export const setApplicationsArrangement = async (
    userId: string,
    applicationIds: string[],
    arrangement: Arrangement | null,
): Promise<void> => {
    await recordApplicationChange({
        userId,
        applicationIds,
        kind: HISTORY_KIND.arrangement,
        mutation: (client) =>
            gen.setApplicationsArrangement(client, {
                applicationIds,
                userId,
                arrangement,
            }),
    });
};

export const deleteApplication = async (
    userId: string,
    applicationId: string,
): Promise<void> => {
    await recordDeletedApplications({
        userId,
        applicationIds: [applicationId],
        mutation: (client) =>
            gen.deleteApplication(client, { applicationId, userId }),
    });
};

export const deleteApplications = async (
    userId: string,
    applicationIds: string[],
): Promise<void> => {
    await recordDeletedApplications({
        userId,
        applicationIds,
        mutation: (client) =>
            gen.deleteApplications(client, { applicationIds, userId }),
    });
};

export const updateList = async (
    userId: string,
    listId: string,
    input: { name: string; description: string | null; status: ListStatus },
): Promise<boolean> => {
    return recordListChange({
        userId,
        listId,
        mutation: async (client) => {
            const row = await gen.updateList(client, {
                id: listId,
                userId,
                name: input.name,
                description: input.description,
                status: input.status,
            });
            return row !== null;
        },
    });
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
    const [list, applicationRows] = await Promise.all([
        gen.getListForUser(pool, { id: listId, userId }),
        gen.listApplicationsForList(pool, {
            listId,
            userId,
            maxApplications: MAX_APPLICATIONS_READ_PER_LIST,
        }),
    ]);
    if (!list) return null;

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
    for (const row of applicationRows) {
        const status = row.status as ApplicationStatus;
        counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    const sumOf = (statuses: ApplicationStatus[]): number =>
        statuses.reduce(
            (total, status) => total + (counts.get(status) ?? 0),
            0,
        );

    const stats: Stat[] = [
        { label: "Total", value: String(applications.length) },
        { label: "Active", value: String(sumOf(ACTIVE_STATUSES)) },
        { label: "Interviewing", value: String(sumOf(INTERVIEWING_STATUSES)) },
        { label: "Offers", value: String(sumOf(OFFER_STATUSES)) },
    ];

    return {
        id: list.id,
        name: list.name,
        description: list.description,
        status: list.status as ListStatus,
        stats,
        applications,
    };
};

// The status trail is only needed by the collapsed Insights panel. Keeping it
// out of the main detail read avoids scanning and serializing every event when
// the user came to work in the table.
export const getListInsights = async (
    userId: string,
    listId: string,
): Promise<ListInsightsData | null> => {
    const pool = getPool();
    const list = await gen.getListForUser(pool, { id: listId, userId });
    if (!list) return null;

    const [applicationRows, statusEventRows] = await Promise.all([
        gen.listApplicationsForList(pool, {
            listId,
            userId,
            maxApplications: MAX_APPLICATIONS_READ_PER_LIST,
        }),
        gen.statusEventsForList(pool, {
            listId,
            maxEvents: MAX_EVENTS_READ_PER_APPLICATION,
        }),
    ]);

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

    const historyOf = (id: string, status: ApplicationStatus): StatusStep[] => {
        const trail = trails.get(id) ?? [];
        if (trail[trail.length - 1]?.status === status) return trail;
        return [...trail, { id: null, status, at: null }];
    };

    const flow: FlowEntry[] = applicationRows.map((row) => {
        const status = row.status as ApplicationStatus;
        return {
            status,
            history: historyOf(row.id, status).map((step) => step.status),
        };
    });

    const sentAt = applicationRows.flatMap((row) => {
        const trail = historyOf(row.id, row.status as ApplicationStatus);
        if (!wasSent(trail.map((step) => step.status))) return [];
        const recorded = trail.find((step) => step.at)?.at;
        return [
            row.appliedAt ?? (recorded ? new Date(recorded) : row.updatedAt),
        ];
    });

    return {
        funnel: funnelFrom(flow),
        flow,
        volume: volumeFrom(sentAt),
        places: placesFrom(applicationRows.map((row) => row.location)),
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
