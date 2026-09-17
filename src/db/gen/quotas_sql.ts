import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const applicationQuotaUsageQuery = `-- name: ApplicationQuotaUsage :one
select
    count(*) filter (where a.list_id = $1)::int as in_list,
    count(*)::int as total
from applications a
join lists l on l.id = a.list_id
where l.user_id = $2`;

export interface ApplicationQuotaUsageArgs {
    listId: string;
    userId: string;
}

export interface ApplicationQuotaUsageRow {
    inList: number;
    total: number;
}

export async function applicationQuotaUsage(client: Client, args: ApplicationQuotaUsageArgs): Promise<ApplicationQuotaUsageRow | null> {
    const result = await client.query({
        text: applicationQuotaUsageQuery,
        values: [args.listId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        inList: row[0],
        total: row[1]
    };
}

export const countApplicationEventsQuery = `-- name: CountApplicationEvents :one
select
    count(*)::int as total,
    count(*) filter (
        where e.id = any($1::uuid[])
    )::int as removing
from application_events e
join applications a on a.id = e.application_id
join lists l on l.id = a.list_id
where e.application_id = $2
    and l.user_id = $3`;

export interface CountApplicationEventsArgs {
    removedEventIds: string[];
    applicationId: string;
    userId: string;
}

export interface CountApplicationEventsRow {
    total: number;
    removing: number;
}

export async function countApplicationEvents(client: Client, args: CountApplicationEventsArgs): Promise<CountApplicationEventsRow | null> {
    const result = await client.query({
        text: countApplicationEventsQuery,
        values: [args.removedEventIds, args.applicationId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        total: row[0],
        removing: row[1]
    };
}

export const applicationsAtEventCapQuery = `-- name: ApplicationsAtEventCap :many
select e.application_id
from application_events e
where e.application_id = any($1::uuid[])
group by e.application_id
having count(*) >= $2::int`;

export interface ApplicationsAtEventCapArgs {
    applicationIds: string[];
    maxEvents: number;
}

export interface ApplicationsAtEventCapRow {
    applicationId: string;
}

export async function applicationsAtEventCap(client: Client, args: ApplicationsAtEventCapArgs): Promise<ApplicationsAtEventCapRow[]> {
    const result = await client.query({
        text: applicationsAtEventCapQuery,
        values: [args.applicationIds, args.maxEvents],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            applicationId: row[0]
        };
    });
}

