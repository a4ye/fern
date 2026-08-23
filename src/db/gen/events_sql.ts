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
with trail as (
    select
        e.id,
        e.application_id,
        a.company_name,
        e.from_status,
        e.to_status,
        e.note,
        e.occurred_at,
        row_number() over (
            partition by e.application_id
            order by e.occurred_at desc, e.id desc
        ) as recency
    from application_events e
    join applications a on a.id = e.application_id
    where a.list_id = $2
)
select
    id,
    application_id,
    company_name,
    from_status,
    to_status,
    note,
    occurred_at
from trail
where recency <= $1::int
order by application_id, occurred_at, id`;

export interface StatusEventsForListArgs {
    maxEvents: number;
    listId: string;
}

export interface StatusEventsForListRow {
    id: string;
    applicationId: string;
    companyName: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    occurredAt: Date;
}

export async function statusEventsForList(client: Client, args: StatusEventsForListArgs): Promise<StatusEventsForListRow[]> {
    const result = await client.query({
        text: statusEventsForListQuery,
        values: [args.maxEvents, args.listId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            applicationId: row[1],
            companyName: row[2],
            fromStatus: row[3],
            toStatus: row[4],
            note: row[5],
            occurredAt: row[6]
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
insert into application_events (
    application_id, from_status, to_status, note, history_action_id
)
values (
    $1,
    $2,
    $3,
    $4,
    $5::bigint
)`;

export interface InsertApplicationEventArgs {
    applicationId: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    historyActionId: string | null;
}

export async function insertApplicationEvent(client: Client, args: InsertApplicationEventArgs): Promise<void> {
    await client.query({
        text: insertApplicationEventQuery,
        values: [args.applicationId, args.fromStatus, args.toStatus, args.note, args.historyActionId],
        rowMode: "array"
    });
}

export const applyStatusStepEditsQuery = `-- name: ApplyStatusStepEdits :exec
with locked as materialized (
    select a.id, a.status
    from applications a
    join lists l on l.id = a.list_id
    where a.id = $2 and l.user_id = $3
    for update of a
),
deleted as (
    delete from application_events e
    using locked
    where e.application_id = locked.id
        and e.id = any($4::uuid[])
    returning e.id
),
base as materialized (
    select
        locked.id,
        case
            when exists (select 1 from deleted) then coalesce(
                (
                    select e.to_status
                    from application_events e
                    where e.application_id = locked.id
                        and not (e.id = any($4::uuid[]))
                    order by e.occurred_at desc, e.id desc
                    limit 1
                ),
                'not_applied'::application_status
            )
            else locked.status
        end as status
    from locked
),
additions as materialized (
    select addition.status, addition.ordinality
    from unnest($5::application_status[])
        with ordinality as addition(status, ordinality)
),
inserted as (
    insert into application_events (
        application_id,
        from_status,
        to_status,
        occurred_at,
        history_action_id
    )
    select
        base.id,
        case
            when addition.ordinality = 1 then base.status
            else lag(addition.status) over (order by addition.ordinality)
        end,
        addition.status,
        statement_timestamp()
            + ((addition.ordinality - 1) * interval '1 microsecond'),
        $6::bigint
    from base
    cross join additions addition
    returning to_status, occurred_at
),
final_status as (
    select coalesce(
        (
            select inserted.to_status
            from inserted
            order by inserted.occurred_at desc
            limit 1
        ),
        base.status
    ) as status
    from base
)
update applications a
set
    status = final_status.status,
    applied_at = case
        when final_status.status = 'applied' then coalesce(
            a.applied_at,
            (current_timestamp at time zone $1::text)::date
        )
        else a.applied_at
    end
from final_status
where a.id = $2
    and (
        exists (select 1 from deleted)
        or exists (select 1 from inserted)
    )`;

export interface ApplyStatusStepEditsArgs {
    timeZone: string;
    applicationId: string;
    userId: string;
    removedEventIds: string[];
    addedStatuses: string[];
    historyActionId: string;
}

export async function applyStatusStepEdits(client: Client, args: ApplyStatusStepEditsArgs): Promise<void> {
    await client.query({
        text: applyStatusStepEditsQuery,
        values: [args.timeZone, args.applicationId, args.userId, args.removedEventIds, args.addedStatuses, args.historyActionId],
        rowMode: "array"
    });
}

