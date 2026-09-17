import { getPool } from "@/db/client";
import * as gen from "@/db/gen/quotas_sql";
import { countListsForUser } from "@/db/gen/lists_sql";
import {
    MAX_APPLICATIONS,
    MAX_APPLICATIONS_PER_LIST,
    MAX_EVENTS_PER_APPLICATION,
    MAX_LISTS,
} from "@/lib/limits";

// Whether there is room to write, and what to say when there is not. Counted
// rather than tracked: a running total in a column is another thing to keep
// true, and these run over an account's own rows behind an index.
//
// The count and the write that follows it are two statements, so two requests
// racing can land a handful of rows over a ceiling. That is the right trade for
// a guard whose job is to stop a list of a million, not to be exact at 10,000.
export type QuotaCheck = { ok: true } | { ok: false; error: string };

const OK: QuotaCheck = { ok: true };

export const listQuota = async (userId: string): Promise<QuotaCheck> => {
    const row = await countListsForUser(getPool(), { userId, search: "" });
    if ((row?.total ?? 0) < MAX_LISTS) return OK;
    return {
        ok: false,
        error: `You can keep ${MAX_LISTS} lists. Delete one to make room.`,
    };
};

// `adding` is how many applications are about to be written, so an import is
// answered before it is halfway in rather than partway through.
export const applicationQuota = async (
    userId: string,
    listId: string,
    adding: number,
): Promise<QuotaCheck> => {
    const usage = await gen.applicationQuotaUsage(getPool(), {
        userId,
        listId,
    });
    const inList = usage?.inList ?? 0;
    const total = usage?.total ?? 0;

    if (inList + adding > MAX_APPLICATIONS_PER_LIST) {
        return {
            ok: false,
            error: `A list holds ${MAX_APPLICATIONS_PER_LIST.toLocaleString()} applications. This one holds ${inList.toLocaleString()}.`,
        };
    }
    if (total + adding > MAX_APPLICATIONS) {
        return {
            ok: false,
            error: `You can keep ${MAX_APPLICATIONS.toLocaleString()} applications. You have ${total.toLocaleString()}.`,
        };
    }
    return OK;
};

// `adding` counts the steps a save is about to record, and `removedEventIds`
// the ones it says it is dropping. Only the ids the application actually holds
// make room: the delete matches by id, so anything else in that list is a claim
// the save cannot back, and subtracting it would be how the cap gets walked
// past a hundred at a time.
export const statusEventQuota = async (
    userId: string,
    applicationId: string,
    adding: number,
    removedEventIds: string[] = [],
): Promise<QuotaCheck> => {
    const row = await gen.countApplicationEvents(getPool(), {
        userId,
        applicationId,
        removedEventIds,
    });
    const after = (row?.total ?? 0) - (row?.removing ?? 0) + adding;
    if (after <= MAX_EVENTS_PER_APPLICATION) return OK;
    return {
        ok: false,
        error: `This application has recorded ${MAX_EVENTS_PER_APPLICATION} status changes, which is as many as it keeps.`,
    };
};

// The applications in a bulk selection that can record no further moves, which
// is almost always none of them.
export const applicationsAtEventCap = async (
    applicationIds: string[],
): Promise<Set<string>> => {
    const rows = await gen.applicationsAtEventCap(getPool(), {
        applicationIds,
        maxEvents: MAX_EVENTS_PER_APPLICATION,
    });
    return new Set(rows.map((row) => row.applicationId));
};
