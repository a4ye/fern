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

export const statusEventsForListQuery = `-- name: StatusEventsForList :many
select e.id, e.application_id, e.from_status, e.to_status, e.occurred_at
from application_events e
join applications a on a.id = e.application_id
where a.list_id = $1
order by e.application_id, e.occurred_at`;

export interface StatusEventsForListArgs {
    listId: string;
}

export interface StatusEventsForListRow {
    id: string;
    applicationId: string;
    fromStatus: string | null;
    toStatus: string | null;
    occurredAt: Date;
}

export async function statusEventsForList(client: Client, args: StatusEventsForListArgs): Promise<StatusEventsForListRow[]> {
    const result = await client.query({
        text: statusEventsForListQuery,
        values: [args.listId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            applicationId: row[1],
            fromStatus: row[2],
            toStatus: row[3],
            occurredAt: row[4]
        };
    });
}

export const statusEventsForApplicationQuery = `-- name: StatusEventsForApplication :many
select e.id, e.from_status, e.to_status, e.occurred_at
from application_events e
join applications a on a.id = e.application_id
join lists l on l.id = a.list_id
where e.application_id = $1 and l.user_id = $2
order by e.occurred_at`;

export interface StatusEventsForApplicationArgs {
    applicationId: string;
    userId: string;
}

export interface StatusEventsForApplicationRow {
    id: string;
    fromStatus: string | null;
    toStatus: string | null;
    occurredAt: Date;
}

export async function statusEventsForApplication(client: Client, args: StatusEventsForApplicationArgs): Promise<StatusEventsForApplicationRow[]> {
    const result = await client.query({
        text: statusEventsForApplicationQuery,
        values: [args.applicationId, args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            fromStatus: row[1],
            toStatus: row[2],
            occurredAt: row[3]
        };
    });
}

export const deleteApplicationEventQuery = `-- name: DeleteApplicationEvent :exec
delete from application_events e
using applications a, lists l
where e.application_id = a.id
    and a.list_id = l.id
    and e.id = $1
    and e.application_id = $2
    and l.user_id = $3`;

export interface DeleteApplicationEventArgs {
    eventId: string;
    applicationId: string;
    userId: string;
}

export async function deleteApplicationEvent(client: Client, args: DeleteApplicationEventArgs): Promise<void> {
    await client.query({
        text: deleteApplicationEventQuery,
        values: [args.eventId, args.applicationId, args.userId],
        rowMode: "array"
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

