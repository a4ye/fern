import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const createApplicationQuery = `-- name: CreateApplication :one
insert into applications (
    list_id, position, company_name, role_title, status, url, location,
    arrangement, applied_at, pay_min, pay_max, pay_currency, pay_period,
    bonus_amount, pay_note, notes, created_by_history_action_id
)
select
    l.id,
    coalesce(
        (select max(a.position) + 1 from applications a where a.list_id = l.id),
        0
    ),
    $1,
    $2,
    $3::application_status,
    $4,
    $5,
    $6::work_arrangement,
    coalesce(
        $7::date,
        case
            when $3::application_status = 'applied'
            then (current_timestamp at time zone $8::text)::date
        end
    ),
    $9::numeric,
    $10::numeric,
    $11,
    $12::pay_period,
    $13::numeric,
    $14,
    $15,
    $16::bigint
from lists l
where l.id = $17 and l.user_id = $18
returning id`;

export interface CreateApplicationArgs {
    companyName: string;
    roleTitle: string | null;
    status: string;
    url: string | null;
    location: string | null;
    arrangement: string | null;
    appliedAt: Date | null;
    timeZone: string;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: string | null;
    bonusAmount: string | null;
    payNote: string | null;
    notes: string | null;
    historyActionId: string;
    listId: string;
    userId: string;
}

export interface CreateApplicationRow {
    id: string;
}

export async function createApplication(client: Client, args: CreateApplicationArgs): Promise<CreateApplicationRow | null> {
    const result = await client.query({
        text: createApplicationQuery,
        values: [args.companyName, args.roleTitle, args.status, args.url, args.location, args.arrangement, args.appliedAt, args.timeZone, args.payMin, args.payMax, args.payCurrency, args.payPeriod, args.bonusAmount, args.payNote, args.notes, args.historyActionId, args.listId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0]
    };
}

export const createApplicationsQuery = `-- name: CreateApplications :many
insert into applications (
    list_id, position, company_name, role_title, status, url, location,
    arrangement, applied_at, pay_min, pay_max, pay_currency, pay_period,
    pay_note, notes, created_by_history_action_id
)
select
    l.id,
    coalesce(
        (select max(a.position) + 1 from applications a where a.list_id = l.id),
        0
    ) + row.offset,
    row.company_name,
    row.role_title,
    row.status::application_status,
    row.url,
    row.location,
    row.arrangement::work_arrangement,
    coalesce(
        row.applied_at::date,
        case
            when row.status::application_status = 'applied'
            then (current_timestamp at time zone $1::text)::date
        end
    ),
    row.pay_min::numeric,
    row.pay_max::numeric,
    row.pay_currency,
    row.pay_period::pay_period,
    row.pay_note,
    row.notes,
    $2::bigint
from lists l
cross join jsonb_to_recordset($3::jsonb) as row(
    "offset" int,
    company_name text,
    role_title text,
    status text,
    url text,
    location text,
    arrangement text,
    applied_at text,
    pay_min text,
    pay_max text,
    pay_currency text,
    pay_period text,
    pay_note text,
    notes text
)
where l.id = $4 and l.user_id = $5
returning id`;

export interface CreateApplicationsArgs {
    timeZone: string;
    historyActionId: string;
    rows: any;
    listId: string;
    userId: string;
}

export interface CreateApplicationsRow {
    id: string;
}

export async function createApplications(client: Client, args: CreateApplicationsArgs): Promise<CreateApplicationsRow[]> {
    const result = await client.query({
        text: createApplicationsQuery,
        values: [args.timeZone, args.historyActionId, args.rows, args.listId, args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0]
        };
    });
}

export const listApplicationsForListQuery = `-- name: ListApplicationsForList :many
select
    id,
    company_name,
    role_title,
    status,
    url,
    location,
    arrangement,
    pay_min,
    pay_max,
    pay_currency,
    pay_period,
    bonus_amount,
    pay_note,
    applied_at,
    updated_at
from applications
where list_id = $1
order by created_at desc, position desc
limit $2::int`;

export interface ListApplicationsForListArgs {
    listId: string;
    maxApplications: number;
}

export interface ListApplicationsForListRow {
    id: string;
    companyName: string;
    roleTitle: string | null;
    status: string;
    url: string | null;
    location: string | null;
    arrangement: string | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: string | null;
    bonusAmount: string | null;
    payNote: string | null;
    appliedAt: Date | null;
    updatedAt: Date;
}

export async function listApplicationsForList(client: Client, args: ListApplicationsForListArgs): Promise<ListApplicationsForListRow[]> {
    const result = await client.query({
        text: listApplicationsForListQuery,
        values: [args.listId, args.maxApplications],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            companyName: row[1],
            roleTitle: row[2],
            status: row[3],
            url: row[4],
            location: row[5],
            arrangement: row[6],
            payMin: row[7],
            payMax: row[8],
            payCurrency: row[9],
            payPeriod: row[10],
            bonusAmount: row[11],
            payNote: row[12],
            appliedAt: row[13],
            updatedAt: row[14]
        };
    });
}

export const applicationDetailForUserQuery = `-- name: ApplicationDetailForUser :one
select a.notes
from applications a
join lists l on l.id = a.list_id
where a.id = $1 and l.user_id = $2`;

export interface ApplicationDetailForUserArgs {
    applicationId: string;
    userId: string;
}

export interface ApplicationDetailForUserRow {
    notes: string | null;
}

export async function applicationDetailForUser(client: Client, args: ApplicationDetailForUserArgs): Promise<ApplicationDetailForUserRow | null> {
    const result = await client.query({
        text: applicationDetailForUserQuery,
        values: [args.applicationId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        notes: row[0]
    };
}

export const pipelineForListQuery = `-- name: PipelineForList :many
select status, count(*)::int as count
from applications
where list_id = $1
group by status`;

export interface PipelineForListArgs {
    listId: string;
}

export interface PipelineForListRow {
    status: string;
    count: number;
}

export async function pipelineForList(client: Client, args: PipelineForListArgs): Promise<PipelineForListRow[]> {
    const result = await client.query({
        text: pipelineForListQuery,
        values: [args.listId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            status: row[0],
            count: row[1]
        };
    });
}

export const applicationsForUserQuery = `-- name: ApplicationsForUser :many
select
    a.id,
    a.company_name,
    a.role_title,
    a.status,
    l.id as list_id,
    l.name as list_name
from applications a
join lists l on l.id = a.list_id
where l.user_id = $1
order by a.updated_at desc
limit 2000`;

export interface ApplicationsForUserArgs {
    userId: string;
}

export interface ApplicationsForUserRow {
    id: string;
    companyName: string;
    roleTitle: string | null;
    status: string;
    listId: string;
    listName: string;
}

export async function applicationsForUser(client: Client, args: ApplicationsForUserArgs): Promise<ApplicationsForUserRow[]> {
    const result = await client.query({
        text: applicationsForUserQuery,
        values: [args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            companyName: row[1],
            roleTitle: row[2],
            status: row[3],
            listId: row[4],
            listName: row[5]
        };
    });
}

export const getApplicationForUserQuery = `-- name: GetApplicationForUser :one
select a.id, a.status
from applications a
join lists l on l.id = a.list_id
where a.id = $1 and l.user_id = $2
for update of a`;

export interface GetApplicationForUserArgs {
    applicationId: string;
    userId: string;
}

export interface GetApplicationForUserRow {
    id: string;
    status: string;
}

export async function getApplicationForUser(client: Client, args: GetApplicationForUserArgs): Promise<GetApplicationForUserRow | null> {
    const result = await client.query({
        text: getApplicationForUserQuery,
        values: [args.applicationId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        status: row[1]
    };
}

export const lockApplicationsForUserQuery = `-- name: LockApplicationsForUser :many
select a.id
from applications a
join lists l on l.id = a.list_id
where a.id = any($1::uuid[]) and l.user_id = $2
order by a.id
for update of a`;

export interface LockApplicationsForUserArgs {
    applicationIds: string[];
    userId: string;
}

export interface LockApplicationsForUserRow {
    id: string;
}

export async function lockApplicationsForUser(client: Client, args: LockApplicationsForUserArgs): Promise<LockApplicationsForUserRow[]> {
    const result = await client.query({
        text: lockApplicationsForUserQuery,
        values: [args.applicationIds, args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0]
        };
    });
}

export const updateApplicationsBulkQuery = `-- name: UpdateApplicationsBulk :exec
with locked as materialized (
    select
        a.id,
        a.status as old_status,
        input.value ->> 'company_name' as company_name,
        input.value ->> 'role_title' as role_title,
        input.value ->> 'status' as status,
        input.value ->> 'url' as url,
        input.value ->> 'location' as location,
        input.value ->> 'arrangement' as arrangement,
        input.value ->> 'applied_at' as applied_at,
        (input.value ->> 'pay_typed')::boolean as pay_typed,
        input.value ->> 'pay_min' as pay_min,
        input.value ->> 'pay_max' as pay_max,
        input.value ->> 'pay_currency' as pay_currency,
        input.value ->> 'pay_period' as pay_period,
        input.value ->> 'pay_note' as pay_note
    from applications a
    join lists l on l.id = a.list_id
    join jsonb_array_elements($2::jsonb) as input(value)
        on (input.value ->> 'id')::uuid = a.id
    where l.user_id = $3
    order by a.id
    for update of a
),
updated as (
    update applications a
    set
        company_name = row.company_name,
        role_title = row.role_title,
        status = row.status::application_status,
        url = row.url,
        location = row.location,
        arrangement = row.arrangement::work_arrangement,
        applied_at = case
            when a.applied_at is null
                and a.status <> 'applied'
                and row.status::application_status = 'applied'
                and row.applied_at::date is null
            then (current_timestamp at time zone $4::text)::date
            else row.applied_at::date
        end,
        pay_min = case
            when row.pay_typed then row.pay_min::numeric else a.pay_min
        end,
        pay_max = case
            when row.pay_typed then row.pay_max::numeric else a.pay_max
        end,
        pay_currency = case
            when row.pay_typed then row.pay_currency else a.pay_currency
        end,
        pay_period = case
            when row.pay_typed then row.pay_period::pay_period else a.pay_period
        end,
        pay_note = case
            when row.pay_typed then row.pay_note else a.pay_note
        end
    from locked row
    where a.id = row.id
    returning a.id, row.old_status, a.status as new_status
)
insert into application_events (
    application_id, from_status, to_status, history_action_id
)
select id, old_status, new_status, $1::bigint
from updated
where old_status <> new_status`;

export interface UpdateApplicationsBulkArgs {
    historyActionId: string;
    rows: any;
    userId: string;
    timeZone: string;
}

export async function updateApplicationsBulk(client: Client, args: UpdateApplicationsBulkArgs): Promise<void> {
    await client.query({
        text: updateApplicationsBulkQuery,
        values: [args.historyActionId, args.rows, args.userId, args.timeZone],
        rowMode: "array"
    });
}

export const updateApplicationQuery = `-- name: UpdateApplication :exec
update applications a
set
    company_name = $1,
    role_title = $2,
    status = $3::application_status,
    url = $4,
    location = $5,
    arrangement = $6::work_arrangement,
    applied_at = case
        when a.applied_at is null
            and a.status <> 'applied'
            and $3::application_status = 'applied'
            and $7::date is null
        then (current_timestamp at time zone $8::text)::date
        else $7::date
    end,
    pay_min = $9::numeric,
    pay_max = $10::numeric,
    pay_currency = $11,
    pay_period = $12::pay_period,
    pay_note = $13
from lists l
where a.list_id = l.id
    and a.id = $14
    and l.user_id = $15`;

export interface UpdateApplicationArgs {
    companyName: string;
    roleTitle: string | null;
    status: string;
    url: string | null;
    location: string | null;
    arrangement: string | null;
    appliedAt: Date | null;
    timeZone: string;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: string | null;
    payNote: string | null;
    applicationId: string;
    userId: string;
}

export async function updateApplication(client: Client, args: UpdateApplicationArgs): Promise<void> {
    await client.query({
        text: updateApplicationQuery,
        values: [args.companyName, args.roleTitle, args.status, args.url, args.location, args.arrangement, args.appliedAt, args.timeZone, args.payMin, args.payMax, args.payCurrency, args.payPeriod, args.payNote, args.applicationId, args.userId],
        rowMode: "array"
    });
}

export const updateApplicationFieldsQuery = `-- name: UpdateApplicationFields :exec
update applications a
set
    company_name = $1,
    role_title = $2,
    status = $3::application_status,
    url = $4,
    location = $5,
    arrangement = $6::work_arrangement,
    applied_at = case
        when a.applied_at is null
            and a.status <> 'applied'
            and $3::application_status = 'applied'
            and $7::date is null
        then (current_timestamp at time zone $8::text)::date
        else $7::date
    end
from lists l
where a.list_id = l.id
    and a.id = $9
    and l.user_id = $10`;

export interface UpdateApplicationFieldsArgs {
    companyName: string;
    roleTitle: string | null;
    status: string;
    url: string | null;
    location: string | null;
    arrangement: string | null;
    appliedAt: Date | null;
    timeZone: string;
    applicationId: string;
    userId: string;
}

export async function updateApplicationFields(client: Client, args: UpdateApplicationFieldsArgs): Promise<void> {
    await client.query({
        text: updateApplicationFieldsQuery,
        values: [args.companyName, args.roleTitle, args.status, args.url, args.location, args.arrangement, args.appliedAt, args.timeZone, args.applicationId, args.userId],
        rowMode: "array"
    });
}

export const updateApplicationDetailQuery = `-- name: UpdateApplicationDetail :exec
update applications a
set
    company_name = $1,
    role_title = $2,
    url = $3,
    location = $4,
    arrangement = $5::work_arrangement,
    applied_at = $6::date,
    pay_min = $7::numeric,
    pay_max = $8::numeric,
    pay_currency = $9,
    pay_period = $10::pay_period,
    bonus_amount = $11::numeric,
    pay_note = $12,
    notes = $13
from lists l
where a.list_id = l.id
    and a.id = $14
    and l.user_id = $15`;

export interface UpdateApplicationDetailArgs {
    companyName: string;
    roleTitle: string | null;
    url: string | null;
    location: string | null;
    arrangement: string | null;
    appliedAt: Date | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: string | null;
    bonusAmount: string | null;
    payNote: string | null;
    notes: string | null;
    applicationId: string;
    userId: string;
}

export async function updateApplicationDetail(client: Client, args: UpdateApplicationDetailArgs): Promise<void> {
    await client.query({
        text: updateApplicationDetailQuery,
        values: [args.companyName, args.roleTitle, args.url, args.location, args.arrangement, args.appliedAt, args.payMin, args.payMax, args.payCurrency, args.payPeriod, args.bonusAmount, args.payNote, args.notes, args.applicationId, args.userId],
        rowMode: "array"
    });
}

export const deleteApplicationQuery = `-- name: DeleteApplication :exec
delete from applications a
using lists l
where a.list_id = l.id
    and a.id = $1
    and l.user_id = $2`;

export interface DeleteApplicationArgs {
    applicationId: string;
    userId: string;
}

export async function deleteApplication(client: Client, args: DeleteApplicationArgs): Promise<void> {
    await client.query({
        text: deleteApplicationQuery,
        values: [args.applicationId, args.userId],
        rowMode: "array"
    });
}

export const deleteApplicationsQuery = `-- name: DeleteApplications :exec
delete from applications a
using lists l
where a.list_id = l.id
    and a.id = any($1::uuid[])
    and l.user_id = $2`;

export interface DeleteApplicationsArgs {
    applicationIds: string[];
    userId: string;
}

export async function deleteApplications(client: Client, args: DeleteApplicationsArgs): Promise<void> {
    await client.query({
        text: deleteApplicationsQuery,
        values: [args.applicationIds, args.userId],
        rowMode: "array"
    });
}

export const insertStatusEventsQuery = `-- name: InsertStatusEvents :exec
insert into application_events (
    application_id, from_status, to_status, history_action_id
)
select
    a.id,
    a.status,
    $1::application_status,
    $2::bigint
from applications a
join lists l on l.id = a.list_id
where a.id = any($3::uuid[])
    and l.user_id = $4
    and a.status <> $1::application_status`;

export interface InsertStatusEventsArgs {
    status: string;
    historyActionId: string;
    applicationIds: string[];
    userId: string;
}

export async function insertStatusEvents(client: Client, args: InsertStatusEventsArgs): Promise<void> {
    await client.query({
        text: insertStatusEventsQuery,
        values: [args.status, args.historyActionId, args.applicationIds, args.userId],
        rowMode: "array"
    });
}

export const setApplicationsStatusQuery = `-- name: SetApplicationsStatus :exec
update applications a
set
    status = $1::application_status,
    applied_at = case
        when $1::application_status = 'applied'
        then coalesce(
            a.applied_at,
            (current_timestamp at time zone $2::text)::date
        )
        else a.applied_at
    end
from lists l
where a.list_id = l.id
    and a.id = any($3::uuid[])
    and l.user_id = $4
    and a.status <> $1::application_status`;

export interface SetApplicationsStatusArgs {
    status: string;
    timeZone: string;
    applicationIds: string[];
    userId: string;
}

export async function setApplicationsStatus(client: Client, args: SetApplicationsStatusArgs): Promise<void> {
    await client.query({
        text: setApplicationsStatusQuery,
        values: [args.status, args.timeZone, args.applicationIds, args.userId],
        rowMode: "array"
    });
}

export const setApplicationsArrangementQuery = `-- name: SetApplicationsArrangement :exec
update applications a
set arrangement = $1::work_arrangement
from lists l
where a.list_id = l.id
    and a.id = any($2::uuid[])
    and l.user_id = $3
    and a.arrangement is distinct from
        $1::work_arrangement`;

export interface SetApplicationsArrangementArgs {
    arrangement: string | null;
    applicationIds: string[];
    userId: string;
}

export async function setApplicationsArrangement(client: Client, args: SetApplicationsArrangementArgs): Promise<void> {
    await client.query({
        text: setApplicationsArrangementQuery,
        values: [args.arrangement, args.applicationIds, args.userId],
        rowMode: "array"
    });
}

export const setApplicationStatusQuery = `-- name: SetApplicationStatus :exec
update applications a
set
    status = $1::application_status,
    applied_at = case
        when $1::application_status = 'applied'
        then coalesce(
            a.applied_at,
            (current_timestamp at time zone $2::text)::date
        )
        else a.applied_at
    end
from lists l
where a.list_id = l.id
    and a.id = $3
    and l.user_id = $4`;

export interface SetApplicationStatusArgs {
    status: string;
    timeZone: string;
    applicationId: string;
    userId: string;
}

export async function setApplicationStatus(client: Client, args: SetApplicationStatusArgs): Promise<void> {
    await client.query({
        text: setApplicationStatusQuery,
        values: [args.status, args.timeZone, args.applicationId, args.userId],
        rowMode: "array"
    });
}

