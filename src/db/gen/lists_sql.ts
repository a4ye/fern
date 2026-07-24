import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const listListsForUserQuery = `-- name: ListListsForUser :many
select
    l.id,
    l.name,
    l.description,
    l.status,
    l.pinned_at,
    l.updated_at,
    count(a.id)::int as total_applications
from lists l
left join applications a on a.list_id = l.id
where l.user_id = $1
    and (
        $2::text = ''
        or l.name ilike '%' || $2 || '%'
        or coalesce(l.description, '') ilike '%' || $2 || '%'
    )
group by l.id
order by
    (l.pinned_at is not null) desc,
    case when $3::text = 'name' then l.name end asc,
    case when $3::text = 'applications' then count(a.id) end desc,
    l.updated_at desc
limit $5::int
offset $4::int`;

export interface ListListsForUserArgs {
    userId: string;
    search: string;
    sort: string;
    pageOffset: number;
    pageLimit: number;
}

export interface ListListsForUserRow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    pinnedAt: Date | null;
    updatedAt: Date;
    totalApplications: number;
}

export async function listListsForUser(client: Client, args: ListListsForUserArgs): Promise<ListListsForUserRow[]> {
    const result = await client.query({
        text: listListsForUserQuery,
        values: [args.userId, args.search, args.sort, args.pageOffset, args.pageLimit],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            name: row[1],
            description: row[2],
            status: row[3],
            pinnedAt: row[4],
            updatedAt: row[5],
            totalApplications: row[6]
        };
    });
}

export const countListsForUserQuery = `-- name: CountListsForUser :one
select count(*)::int as total
from lists l
where l.user_id = $1
    and (
        $2::text = ''
        or l.name ilike '%' || $2 || '%'
        or coalesce(l.description, '') ilike '%' || $2 || '%'
    )`;

export interface CountListsForUserArgs {
    userId: string;
    search: string;
}

export interface CountListsForUserRow {
    total: number;
}

export async function countListsForUser(client: Client, args: CountListsForUserArgs): Promise<CountListsForUserRow | null> {
    const result = await client.query({
        text: countListsForUserQuery,
        values: [args.userId, args.search],
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

export const createListQuery = `-- name: CreateList :one
insert into lists (user_id, name, description)
values ($1, $2, $3)
returning id, name, description, status, pinned_at, updated_at`;

export interface CreateListArgs {
    userId: string;
    name: string;
    description: string | null;
}

export interface CreateListRow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    pinnedAt: Date | null;
    updatedAt: Date;
}

export async function createList(client: Client, args: CreateListArgs): Promise<CreateListRow | null> {
    const result = await client.query({
        text: createListQuery,
        values: [args.userId, args.name, args.description],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        description: row[2],
        status: row[3],
        pinnedAt: row[4],
        updatedAt: row[5]
    };
}

export const setListPinnedQuery = `-- name: SetListPinned :exec
update lists set pinned_at = now() where id = $1 and user_id = $2`;

export interface SetListPinnedArgs {
    id: string;
    userId: string;
}

export async function setListPinned(client: Client, args: SetListPinnedArgs): Promise<void> {
    await client.query({
        text: setListPinnedQuery,
        values: [args.id, args.userId],
        rowMode: "array"
    });
}

export const setListUnpinnedQuery = `-- name: SetListUnpinned :exec
update lists set pinned_at = null where id = $1 and user_id = $2`;

export interface SetListUnpinnedArgs {
    id: string;
    userId: string;
}

export async function setListUnpinned(client: Client, args: SetListUnpinnedArgs): Promise<void> {
    await client.query({
        text: setListUnpinnedQuery,
        values: [args.id, args.userId],
        rowMode: "array"
    });
}

export const getListForUserQuery = `-- name: GetListForUser :one
select id, name, description, status, created_at, updated_at
from lists
where id = $1 and user_id = $2`;

export interface GetListForUserArgs {
    id: string;
    userId: string;
}

export interface GetListForUserRow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getListForUser(client: Client, args: GetListForUserArgs): Promise<GetListForUserRow | null> {
    const result = await client.query({
        text: getListForUserQuery,
        values: [args.id, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        description: row[2],
        status: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const updateListQuery = `-- name: UpdateList :one
update lists
set
    name = $1,
    description = $2,
    status = $3::list_status,
    updated_at = now()
where id = $4 and user_id = $5
returning id, name, description, status, updated_at`;

export interface UpdateListArgs {
    name: string;
    description: string | null;
    status: string;
    id: string;
    userId: string;
}

export interface UpdateListRow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    updatedAt: Date;
}

export async function updateList(client: Client, args: UpdateListArgs): Promise<UpdateListRow | null> {
    const result = await client.query({
        text: updateListQuery,
        values: [args.name, args.description, args.status, args.id, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        description: row[2],
        status: row[3],
        updatedAt: row[4]
    };
}

export const deleteListQuery = `-- name: DeleteList :exec
delete from lists where id = $1 and user_id = $2`;

export interface DeleteListArgs {
    id: string;
    userId: string;
}

export async function deleteList(client: Client, args: DeleteListArgs): Promise<void> {
    await client.query({
        text: deleteListQuery,
        values: [args.id, args.userId],
        rowMode: "array"
    });
}

