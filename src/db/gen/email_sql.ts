import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const insertEmailSuggestionQuery = `-- name: InsertEmailSuggestion :one
insert into email_suggestions (
    user_id, application_id, message_id, email_from, email_subject,
    email_snippet, email_received_at, current_status, suggested_status,
    confidence, reasoning
)
select
    $1, a.id, $2, $3, $4,
    $5, $6::timestamptz,
    $7::application_status, $8::application_status,
    $9::real, $10
from applications a
join lists l on l.id = a.list_id
where a.id = $11 and l.user_id = $1
on conflict ("application_id", "message_id") do nothing
returning id`;

export interface InsertEmailSuggestionArgs {
    userId: string;
    messageId: string;
    emailFrom: string;
    emailSubject: string;
    emailSnippet: string;
    emailReceivedAt: Date;
    currentStatus: string;
    suggestedStatus: string;
    confidence: number;
    reasoning: string | null;
    applicationId: string;
}

export interface InsertEmailSuggestionRow {
    id: string;
}

export async function insertEmailSuggestion(client: Client, args: InsertEmailSuggestionArgs): Promise<InsertEmailSuggestionRow | null> {
    const result = await client.query({
        text: insertEmailSuggestionQuery,
        values: [args.userId, args.messageId, args.emailFrom, args.emailSubject, args.emailSnippet, args.emailReceivedAt, args.currentStatus, args.suggestedStatus, args.confidence, args.reasoning, args.applicationId],
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

export const insertEmailSuggestionsQuery = `-- name: InsertEmailSuggestions :many
with eligible as materialized (
    select
        (input.value ->> 'application_id')::uuid as application_id,
        input.value ->> 'message_id' as message_id,
        input.value ->> 'email_from' as email_from,
        input.value ->> 'email_subject' as email_subject,
        input.value ->> 'email_snippet' as email_snippet,
        input.value ->> 'email_received_at' as email_received_at,
        input.value ->> 'current_status' as current_status,
        input.value ->> 'suggested_status' as suggested_status,
        (input.value ->> 'confidence')::real as confidence,
        input.value ->> 'reasoning' as reasoning
    from jsonb_array_elements($2::jsonb) as input(value)
    join applications a
        on a.id = (input.value ->> 'application_id')::uuid
    join lists l on l.id = a.list_id
    where l.user_id = $1
)
insert into email_suggestions (
    user_id, application_id, message_id, email_from, email_subject,
    email_snippet, email_received_at, current_status, suggested_status,
    confidence, reasoning
)
select
    $1,
    eligible.application_id,
    eligible.message_id,
    eligible.email_from,
    eligible.email_subject,
    eligible.email_snippet,
    eligible.email_received_at::timestamptz,
    eligible.current_status::application_status,
    eligible.suggested_status::application_status,
    eligible.confidence,
    eligible.reasoning
from eligible
on conflict ("application_id", "message_id") do nothing
returning id`;

export interface InsertEmailSuggestionsArgs {
    userId: string;
    rows: any;
}

export interface InsertEmailSuggestionsRow {
    id: string;
}

export async function insertEmailSuggestions(client: Client, args: InsertEmailSuggestionsArgs): Promise<InsertEmailSuggestionsRow[]> {
    const result = await client.query({
        text: insertEmailSuggestionsQuery,
        values: [args.userId, args.rows],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0]
        };
    });
}

export const listPendingSuggestionsQuery = `-- name: ListPendingSuggestions :many
select
    s.id,
    s.application_id,
    a.company_name,
    a.role_title,
    l.id as list_id,
    l.name as list_name,
    s.email_from,
    s.email_subject,
    s.email_snippet,
    s.email_received_at,
    s.current_status,
    s.suggested_status,
    s.confidence,
    s.reasoning
from email_suggestions s
join applications a on a.id = s.application_id
join lists l on l.id = a.list_id
where s.user_id = $1 and s.state = 'pending'
order by s.email_received_at desc
limit 100`;

export interface ListPendingSuggestionsArgs {
    userId: string;
}

export interface ListPendingSuggestionsRow {
    id: string;
    applicationId: string;
    companyName: string;
    roleTitle: string | null;
    listId: string;
    listName: string;
    emailFrom: string;
    emailSubject: string;
    emailSnippet: string;
    emailReceivedAt: Date;
    currentStatus: string;
    suggestedStatus: string;
    confidence: number;
    reasoning: string | null;
}

export async function listPendingSuggestions(client: Client, args: ListPendingSuggestionsArgs): Promise<ListPendingSuggestionsRow[]> {
    const result = await client.query({
        text: listPendingSuggestionsQuery,
        values: [args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            applicationId: row[1],
            companyName: row[2],
            roleTitle: row[3],
            listId: row[4],
            listName: row[5],
            emailFrom: row[6],
            emailSubject: row[7],
            emailSnippet: row[8],
            emailReceivedAt: row[9],
            currentStatus: row[10],
            suggestedStatus: row[11],
            confidence: row[12],
            reasoning: row[13]
        };
    });
}

export const getSuggestionForUserQuery = `-- name: GetSuggestionForUser :one
select id, application_id, suggested_status, current_status
from email_suggestions
where id = $1 and user_id = $2 and state = 'pending'
for update`;

export interface GetSuggestionForUserArgs {
    id: string;
    userId: string;
}

export interface GetSuggestionForUserRow {
    id: string;
    applicationId: string;
    suggestedStatus: string;
    currentStatus: string;
}

export async function getSuggestionForUser(client: Client, args: GetSuggestionForUserArgs): Promise<GetSuggestionForUserRow | null> {
    const result = await client.query({
        text: getSuggestionForUserQuery,
        values: [args.id, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        applicationId: row[1],
        suggestedStatus: row[2],
        currentStatus: row[3]
    };
}

export const setSuggestionStateQuery = `-- name: SetSuggestionState :exec
update email_suggestions
set state = $1::email_suggestion_state
where id = $2 and user_id = $3 and state = 'pending'`;

export interface SetSuggestionStateArgs {
    state: string;
    id: string;
    userId: string;
}

export async function setSuggestionState(client: Client, args: SetSuggestionStateArgs): Promise<void> {
    await client.query({
        text: setSuggestionStateQuery,
        values: [args.state, args.id, args.userId],
        rowMode: "array"
    });
}

export const countPendingSuggestionsQuery = `-- name: CountPendingSuggestions :one
select count(*)::int as total
from email_suggestions
where user_id = $1 and state = 'pending'`;

export interface CountPendingSuggestionsArgs {
    userId: string;
}

export interface CountPendingSuggestionsRow {
    total: number;
}

export async function countPendingSuggestions(client: Client, args: CountPendingSuggestionsArgs): Promise<CountPendingSuggestionsRow | null> {
    const result = await client.query({
        text: countPendingSuggestionsQuery,
        values: [args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        total: row[0]
    };
}

export const recordEmailSyncQuery = `-- name: RecordEmailSync :exec
with pruned as (
    delete from email_suggestions
    where id in (
        select id
        from email_suggestions
        where state <> 'pending'
            and created_at <= now() - interval '90 days'
        order by created_at
        limit 500
    )
)
insert into email_sync_state (user_id, last_synced_at)
values ($1, now())
on conflict (user_id) do update set last_synced_at = now()`;

export interface RecordEmailSyncArgs {
    userId: string;
}

export async function recordEmailSync(client: Client, args: RecordEmailSyncArgs): Promise<void> {
    await client.query({
        text: recordEmailSyncQuery,
        values: [args.userId],
        rowMode: "array"
    });
}

export const getEmailSyncStateQuery = `-- name: GetEmailSyncState :one
select last_synced_at from email_sync_state where user_id = $1`;

export interface GetEmailSyncStateArgs {
    userId: string;
}

export interface GetEmailSyncStateRow {
    lastSyncedAt: Date | null;
}

export async function getEmailSyncState(client: Client, args: GetEmailSyncStateArgs): Promise<GetEmailSyncStateRow | null> {
    const result = await client.query({
        text: getEmailSyncStateQuery,
        values: [args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        lastSyncedAt: row[0]
    };
}

