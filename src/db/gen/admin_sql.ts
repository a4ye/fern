import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getUserByIdQuery = `-- name: GetUserById :one
select
    "id",
    "name",
    "email",
    "emailVerified" as email_verified,
    "image",
    "createdAt" as created_at,
    "updatedAt" as updated_at
from "user"
where "id" = $1`;

export interface GetUserByIdArgs {
    id: string;
}

export interface GetUserByIdRow {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getUserById(client: Client, args: GetUserByIdArgs): Promise<GetUserByIdRow | null> {
    const result = await client.query({
        text: getUserByIdQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        email: row[2],
        emailVerified: row[3],
        image: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const searchUsersQuery = `-- name: SearchUsers :many
select
    u."id",
    u."name",
    u."email",
    u."createdAt" as created_at,
    (select count(*) from lists l where l.user_id = u."id")::int as lists,
    (select count(*)
     from applications a
     join lists l on l.id = a.list_id
     where l.user_id = u."id")::int as applications
from "user" u
where $1::text = ''
    or u."email" ilike '%' || $1 || '%'
    or u."name" ilike '%' || $1 || '%'
order by u."createdAt" desc
limit $2::int`;

export interface SearchUsersArgs {
    search: string;
    pageLimit: number;
}

export interface SearchUsersRow {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    lists: number;
    applications: number;
}

export async function searchUsers(client: Client, args: SearchUsersArgs): Promise<SearchUsersRow[]> {
    const result = await client.query({
        text: searchUsersQuery,
        values: [args.search, args.pageLimit],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            name: row[1],
            email: row[2],
            createdAt: row[3],
            lists: row[4],
            applications: row[5]
        };
    });
}

