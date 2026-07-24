import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const recentEventsForListQuery = `-- name: RecentEventsForList :many
select
    a.company_name,
    e.from_status,
    e.to_status,
    e.note,
    e.occurred_at
from application_events e
join applications a on a.id = e.application_id
where a.list_id = $1
order by e.occurred_at desc
limit 12`;

export interface RecentEventsForListArgs {
    listId: string;
}

export interface RecentEventsForListRow {
    companyName: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    occurredAt: Date;
}

export async function recentEventsForList(client: Client, args: RecentEventsForListArgs): Promise<RecentEventsForListRow[]> {
    const result = await client.query({
        text: recentEventsForListQuery,
        values: [args.listId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            companyName: row[0],
            fromStatus: row[1],
            toStatus: row[2],
            note: row[3],
            occurredAt: row[4]
        };
    });
}

export const insertApplicationEventQuery = `-- name: InsertApplicationEvent :exec
insert into application_events (application_id, from_status, to_status, note)
values ($1, $2, $3, $4)`;

export interface InsertApplicationEventArgs {
    applicationId: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
}

export async function insertApplicationEvent(client: Client, args: InsertApplicationEventArgs): Promise<void> {
    await client.query({
        text: insertApplicationEventQuery,
        values: [args.applicationId, args.fromStatus, args.toStatus, args.note],
        rowMode: "array"
    });
}

