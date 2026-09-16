import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const userByGithubAccountIdQuery = `-- name: UserByGithubAccountId :one
select u.id, u.name, u.image
from "account" a
join "user" u on u.id = a."userId"
where a."providerId" = 'github' and a."accountId" = $1`;

export interface UserByGithubAccountIdArgs {
    accountId: string;
}

export interface UserByGithubAccountIdRow {
    id: string;
    name: string;
    image: string | null;
}

export async function userByGithubAccountId(client: Client, args: UserByGithubAccountIdArgs): Promise<UserByGithubAccountIdRow | null> {
    const result = await client.query({
        text: userByGithubAccountIdQuery,
        values: [args.accountId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        image: row[2]
    };
}

export const githubAccountIdForUserQuery = `-- name: GithubAccountIdForUser :one
select a."accountId"
from "account" a
where a."userId" = $1 and a."providerId" = 'github'`;

export interface GithubAccountIdForUserArgs {
    userId: string;
}

export interface GithubAccountIdForUserRow {
    accountid: string;
}

export async function githubAccountIdForUser(client: Client, args: GithubAccountIdForUserArgs): Promise<GithubAccountIdForUserRow | null> {
    const result = await client.query({
        text: githubAccountIdForUserQuery,
        values: [args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        accountid: row[0]
    };
}

export const listFriendsQuery = `-- name: ListFriends :many
select
    f.id,
    case
        when f.requester_id = $1 then f.addressee_id
        else f.requester_id
    end as friend_id,
    u.name as friend_name,
    u.image as friend_image,
    f.accepted_at
from friendships f
join "user" u on u.id = case
    when f.requester_id = $1 then f.addressee_id
    else f.requester_id
end
where f.status = 'accepted'
    and (f.requester_id = $1
        or f.addressee_id = $1)
order by u.name asc
limit $2::int`;

export interface ListFriendsArgs {
    userId: string;
    maxRows: number;
}

export interface ListFriendsRow {
    id: string;
    friendId: string | null;
    friendName: string;
    friendImage: string | null;
    acceptedAt: Date | null;
}

export async function listFriends(client: Client, args: ListFriendsArgs): Promise<ListFriendsRow[]> {
    const result = await client.query({
        text: listFriendsQuery,
        values: [args.userId, args.maxRows],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            friendId: row[1],
            friendName: row[2],
            friendImage: row[3],
            acceptedAt: row[4]
        };
    });
}

export const listIncomingRequestsQuery = `-- name: ListIncomingRequests :many
select f.id, u.id as friend_id, u.name as friend_name, u.image as friend_image,
    f.created_at
from friendships f
join "user" u on u.id = f.requester_id
where f.addressee_id = $1 and f.status = 'pending'
order by f.created_at desc
limit $2::int`;

export interface ListIncomingRequestsArgs {
    userId: string;
    maxRows: number;
}

export interface ListIncomingRequestsRow {
    id: string;
    friendId: string;
    friendName: string;
    friendImage: string | null;
    createdAt: Date;
}

export async function listIncomingRequests(client: Client, args: ListIncomingRequestsArgs): Promise<ListIncomingRequestsRow[]> {
    const result = await client.query({
        text: listIncomingRequestsQuery,
        values: [args.userId, args.maxRows],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            friendId: row[1],
            friendName: row[2],
            friendImage: row[3],
            createdAt: row[4]
        };
    });
}

export const listOutgoingRequestsQuery = `-- name: ListOutgoingRequests :many
select f.id, u.id as friend_id, u.name as friend_name, u.image as friend_image,
    f.created_at
from friendships f
join "user" u on u.id = f.addressee_id
where f.requester_id = $1 and f.status = 'pending'
order by f.created_at desc
limit $2::int`;

export interface ListOutgoingRequestsArgs {
    userId: string;
    maxRows: number;
}

export interface ListOutgoingRequestsRow {
    id: string;
    friendId: string;
    friendName: string;
    friendImage: string | null;
    createdAt: Date;
}

export async function listOutgoingRequests(client: Client, args: ListOutgoingRequestsArgs): Promise<ListOutgoingRequestsRow[]> {
    const result = await client.query({
        text: listOutgoingRequestsQuery,
        values: [args.userId, args.maxRows],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            friendId: row[1],
            friendName: row[2],
            friendImage: row[3],
            createdAt: row[4]
        };
    });
}

export const friendshipBetweenQuery = `-- name: FriendshipBetween :one
select f.id, f.requester_id, f.addressee_id, f.status
from friendships f
where least(f.requester_id, f.addressee_id)
        = least($1, $2)
    and greatest(f.requester_id, f.addressee_id)
        = greatest($1, $2)`;

export interface FriendshipBetweenArgs {
    userId: string;
    otherId: string;
}

export interface FriendshipBetweenRow {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: string;
}

export async function friendshipBetween(client: Client, args: FriendshipBetweenArgs): Promise<FriendshipBetweenRow | null> {
    const result = await client.query({
        text: friendshipBetweenQuery,
        values: [args.userId, args.otherId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        requesterId: row[1],
        addresseeId: row[2],
        status: row[3]
    };
}

export const countFriendshipsQuery = `-- name: CountFriendships :one
select
    count(*) filter (where f.status = 'accepted')::int as friends,
    count(*) filter (
        where f.status = 'pending' and f.requester_id = $1
    )::int as sent
from friendships f
where f.requester_id = $1
    or f.addressee_id = $1`;

export interface CountFriendshipsArgs {
    userId: string;
}

export interface CountFriendshipsRow {
    friends: number;
    sent: number;
}

export async function countFriendships(client: Client, args: CountFriendshipsArgs): Promise<CountFriendshipsRow | null> {
    const result = await client.query({
        text: countFriendshipsQuery,
        values: [args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        friends: row[0],
        sent: row[1]
    };
}

export const createFriendRequestQuery = `-- name: CreateFriendRequest :one
insert into friendships (requester_id, addressee_id)
values ($1, $2)
on conflict do nothing
returning id`;

export interface CreateFriendRequestArgs {
    requesterId: string;
    addresseeId: string;
}

export interface CreateFriendRequestRow {
    id: string;
}

export async function createFriendRequest(client: Client, args: CreateFriendRequestArgs): Promise<CreateFriendRequestRow | null> {
    const result = await client.query({
        text: createFriendRequestQuery,
        values: [args.requesterId, args.addresseeId],
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

export const acceptFriendRequestQuery = `-- name: AcceptFriendRequest :one
update friendships f
set status = 'accepted', accepted_at = now()
where f.id = $1
    and f.addressee_id = $2
    and f.status = 'pending'
    and (
        select count(*)
        from friendships held
        where held.status = 'accepted'
            and (held.requester_id = $2
                or held.addressee_id = $2)
    ) < $3::int
returning f.id`;

export interface AcceptFriendRequestArgs {
    id: string;
    userId: string;
    maxFriends: number;
}

export interface AcceptFriendRequestRow {
    id: string;
}

export async function acceptFriendRequest(client: Client, args: AcceptFriendRequestArgs): Promise<AcceptFriendRequestRow | null> {
    const result = await client.query({
        text: acceptFriendRequestQuery,
        values: [args.id, args.userId, args.maxFriends],
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

export const deleteFriendshipQuery = `-- name: DeleteFriendship :one
delete from friendships
where id = $1
    and (requester_id = $2 or addressee_id = $2)
returning
    case
        when requester_id = $2 then addressee_id
        else requester_id
    end as other_id`;

export interface DeleteFriendshipArgs {
    id: string;
    userId: string;
}

export interface DeleteFriendshipRow {
    otherId: string | null;
}

export async function deleteFriendship(client: Client, args: DeleteFriendshipArgs): Promise<DeleteFriendshipRow | null> {
    const result = await client.query({
        text: deleteFriendshipQuery,
        values: [args.id, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        otherId: row[0]
    };
}

export const deleteSharesBetweenQuery = `-- name: DeleteSharesBetween :exec
delete from list_shares s
using lists l
where s.list_id = l.id
    and s.grantee_id is not null
    and (
        (l.user_id = $1 and s.grantee_id = $2)
        or (l.user_id = $2 and s.grantee_id = $1)
    )`;

export interface DeleteSharesBetweenArgs {
    userId: string;
    otherId: string | null;
}

export async function deleteSharesBetween(client: Client, args: DeleteSharesBetweenArgs): Promise<void> {
    await client.query({
        text: deleteSharesBetweenQuery,
        values: [args.userId, args.otherId],
        rowMode: "array"
    });
}

