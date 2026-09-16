import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const listSharesForListQuery = `-- name: ListSharesForList :many
select s.id, s.audience, s.grantee_id, u.name as grantee_name,
    u.image as grantee_image, s.created_at
from list_shares s
join lists l on l.id = s.list_id
left join "user" u on u.id = s.grantee_id
where s.list_id = $1 and l.user_id = $2
order by s.audience asc, u.name asc`;

export interface ListSharesForListArgs {
    listId: string;
    userId: string;
}

export interface ListSharesForListRow {
    id: string;
    audience: string;
    granteeId: string | null;
    granteeName: string | null;
    granteeImage: string | null;
    createdAt: Date;
}

export async function listSharesForList(client: Client, args: ListSharesForListArgs): Promise<ListSharesForListRow[]> {
    const result = await client.query({
        text: listSharesForListQuery,
        values: [args.listId, args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            audience: row[1],
            granteeId: row[2],
            granteeName: row[3],
            granteeImage: row[4],
            createdAt: row[5]
        };
    });
}

export const listLinksForListQuery = `-- name: ListLinksForList :many
select li.id, li.token, li.expires_at, li.revoked_at, li.view_count,
    li.last_viewed_at, li.created_at
from list_links li
join lists l on l.id = li.list_id
where li.list_id = $1 and l.user_id = $2
order by li.created_at desc`;

export interface ListLinksForListArgs {
    listId: string;
    userId: string;
}

export interface ListLinksForListRow {
    id: string;
    token: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    viewCount: number;
    lastViewedAt: Date | null;
    createdAt: Date;
}

export async function listLinksForList(client: Client, args: ListLinksForListArgs): Promise<ListLinksForListRow[]> {
    const result = await client.query({
        text: listLinksForListQuery,
        values: [args.listId, args.userId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            token: row[1],
            expiresAt: row[2],
            revokedAt: row[3],
            viewCount: row[4],
            lastViewedAt: row[5],
            createdAt: row[6]
        };
    });
}

export const countSharesForListQuery = `-- name: CountSharesForList :one
select
    (select count(*)::int from list_shares s where s.list_id = l.id) as shares,
    (select count(*)::int from list_links li where li.list_id = l.id) as links
from lists l
where l.id = $1 and l.user_id = $2`;

export interface CountSharesForListArgs {
    listId: string;
    userId: string;
}

export interface CountSharesForListRow {
    shares: number;
    links: number;
}

export async function countSharesForList(client: Client, args: CountSharesForListArgs): Promise<CountSharesForListRow | null> {
    const result = await client.query({
        text: countSharesForListQuery,
        values: [args.listId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        shares: row[0],
        links: row[1]
    };
}

export const shareListWithFriendsQuery = `-- name: ShareListWithFriends :exec
insert into list_shares (list_id, audience)
select l.id, 'friends'
from lists l
where l.id = $1 and l.user_id = $2
on conflict do nothing`;

export interface ShareListWithFriendsArgs {
    listId: string;
    userId: string;
}

export async function shareListWithFriends(client: Client, args: ShareListWithFriendsArgs): Promise<void> {
    await client.query({
        text: shareListWithFriendsQuery,
        values: [args.listId, args.userId],
        rowMode: "array"
    });
}

export const unshareListWithFriendsQuery = `-- name: UnshareListWithFriends :exec
delete from list_shares s
using lists l
where s.list_id = l.id
    and s.list_id = $1
    and l.user_id = $2
    and s.audience = 'friends'`;

export interface UnshareListWithFriendsArgs {
    listId: string;
    userId: string;
}

export async function unshareListWithFriends(client: Client, args: UnshareListWithFriendsArgs): Promise<void> {
    await client.query({
        text: unshareListWithFriendsQuery,
        values: [args.listId, args.userId],
        rowMode: "array"
    });
}

export const shareListWithPersonQuery = `-- name: ShareListWithPerson :one
insert into list_shares (list_id, audience, grantee_id)
select l.id, 'person', $1
from lists l
where l.id = $2
    and l.user_id = $3
    and exists (
        select 1 from friendships f
        where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id)
                = least($3, $1)
            and greatest(f.requester_id, f.addressee_id)
                = greatest($3, $1)
    )
on conflict do nothing
returning id`;

export interface ShareListWithPersonArgs {
    granteeId: string | null;
    listId: string;
    userId: string;
}

export interface ShareListWithPersonRow {
    id: string;
}

export async function shareListWithPerson(client: Client, args: ShareListWithPersonArgs): Promise<ShareListWithPersonRow | null> {
    const result = await client.query({
        text: shareListWithPersonQuery,
        values: [args.granteeId, args.listId, args.userId],
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

export const unshareListWithPersonQuery = `-- name: UnshareListWithPerson :one
delete from list_shares s
using lists l
where s.list_id = l.id
    and s.list_id = $1
    and l.user_id = $2
    and s.grantee_id = $3
returning s.id`;

export interface UnshareListWithPersonArgs {
    listId: string;
    userId: string;
    granteeId: string | null;
}

export interface UnshareListWithPersonRow {
    id: string;
}

export async function unshareListWithPerson(client: Client, args: UnshareListWithPersonArgs): Promise<UnshareListWithPersonRow | null> {
    const result = await client.query({
        text: unshareListWithPersonQuery,
        values: [args.listId, args.userId, args.granteeId],
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

export const createListLinkQuery = `-- name: CreateListLink :one
insert into list_links (list_id, token, expires_at)
select l.id, $1, $2::timestamptz
from lists l
where l.id = $3 and l.user_id = $4
returning id, token, expires_at, revoked_at, view_count, last_viewed_at,
    created_at`;

export interface CreateListLinkArgs {
    token: string;
    expiresAt: Date | null;
    listId: string;
    userId: string;
}

export interface CreateListLinkRow {
    id: string;
    token: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    viewCount: number;
    lastViewedAt: Date | null;
    createdAt: Date;
}

export async function createListLink(client: Client, args: CreateListLinkArgs): Promise<CreateListLinkRow | null> {
    const result = await client.query({
        text: createListLinkQuery,
        values: [args.token, args.expiresAt, args.listId, args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        token: row[1],
        expiresAt: row[2],
        revokedAt: row[3],
        viewCount: row[4],
        lastViewedAt: row[5],
        createdAt: row[6]
    };
}

export const revokeListLinkQuery = `-- name: RevokeListLink :one
update list_links li
set revoked_at = coalesce(li.revoked_at, now())
from lists l
where li.list_id = l.id
    and li.id = $1
    and l.user_id = $2
returning li.id`;

export interface RevokeListLinkArgs {
    id: string;
    userId: string;
}

export interface RevokeListLinkRow {
    id: string;
}

export async function revokeListLink(client: Client, args: RevokeListLinkArgs): Promise<RevokeListLinkRow | null> {
    const result = await client.query({
        text: revokeListLinkQuery,
        values: [args.id, args.userId],
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

export const deleteListLinkQuery = `-- name: DeleteListLink :one
delete from list_links li
using lists l
where li.list_id = l.id
    and li.id = $1
    and l.user_id = $2
returning li.id`;

export interface DeleteListLinkArgs {
    id: string;
    userId: string;
}

export interface DeleteListLinkRow {
    id: string;
}

export async function deleteListLink(client: Client, args: DeleteListLinkArgs): Promise<DeleteListLinkRow | null> {
    const result = await client.query({
        text: deleteListLinkQuery,
        values: [args.id, args.userId],
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

export const listForLinkTokenQuery = `-- name: ListForLinkToken :one
select li.id as link_id, l.id as list_id, l.user_id as owner_id, l.name,
    l.description, u.name as owner_name, u.image as owner_image, li.expires_at
from list_links li
join lists l on l.id = li.list_id
join "user" u on u.id = l.user_id
where li.token = $1
    and li.revoked_at is null
    and (li.expires_at is null or li.expires_at > now())`;

export interface ListForLinkTokenArgs {
    token: string;
}

export interface ListForLinkTokenRow {
    linkId: string;
    listId: string;
    ownerId: string;
    name: string;
    description: string | null;
    ownerName: string;
    ownerImage: string | null;
    expiresAt: Date | null;
}

export async function listForLinkToken(client: Client, args: ListForLinkTokenArgs): Promise<ListForLinkTokenRow | null> {
    const result = await client.query({
        text: listForLinkTokenQuery,
        values: [args.token],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        linkId: row[0],
        listId: row[1],
        ownerId: row[2],
        name: row[3],
        description: row[4],
        ownerName: row[5],
        ownerImage: row[6],
        expiresAt: row[7]
    };
}

export const recordLinkViewQuery = `-- name: RecordLinkView :exec
update list_links
set view_count = view_count + 1, last_viewed_at = now()
where id = $1`;

export interface RecordLinkViewArgs {
    id: string;
}

export async function recordLinkView(client: Client, args: RecordLinkViewArgs): Promise<void> {
    await client.query({
        text: recordLinkViewQuery,
        values: [args.id],
        rowMode: "array"
    });
}

export const sharedListForViewerQuery = `-- name: SharedListForViewer :one
select l.id, l.user_id as owner_id, l.name, l.description,
    u.name as owner_name, u.image as owner_image
from lists l
join "user" u on u.id = l.user_id
where l.id = $1
    and exists (
        select 1 from friendships f
        where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id)
                = least(l.user_id, $2)
            and greatest(f.requester_id, f.addressee_id)
                = greatest(l.user_id, $2)
    )
    and exists (
        select 1 from list_shares s
        where s.list_id = l.id
            and (
                s.audience = 'friends'
                or s.grantee_id = $2
            )
    )`;

export interface SharedListForViewerArgs {
    listId: string;
    viewerId: string;
}

export interface SharedListForViewerRow {
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    ownerName: string;
    ownerImage: string | null;
}

export async function sharedListForViewer(client: Client, args: SharedListForViewerArgs): Promise<SharedListForViewerRow | null> {
    const result = await client.query({
        text: sharedListForViewerQuery,
        values: [args.listId, args.viewerId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        ownerId: row[1],
        name: row[2],
        description: row[3],
        ownerName: row[4],
        ownerImage: row[5]
    };
}

export const listsSharedWithUserQuery = `-- name: ListsSharedWithUser :many
select l.id, l.name, l.description, l.updated_at, l.user_id as owner_id,
    u.name as owner_name, u.image as owner_image,
    count(a.id)::int as total_applications
from lists l
join "user" u on u.id = l.user_id
left join applications a on a.list_id = l.id
where exists (
    select 1 from friendships f
    where f.status = 'accepted'
        and least(f.requester_id, f.addressee_id)
            = least(l.user_id, $1)
        and greatest(f.requester_id, f.addressee_id)
            = greatest(l.user_id, $1)
)
and exists (
    select 1 from list_shares s
    where s.list_id = l.id
        and (
            s.audience = 'friends'
            or s.grantee_id = $1
        )
)
group by l.id, u.name, u.image
order by l.updated_at desc
limit $2::int`;

export interface ListsSharedWithUserArgs {
    userId: string;
    maxLists: number;
}

export interface ListsSharedWithUserRow {
    id: string;
    name: string;
    description: string | null;
    updatedAt: Date;
    ownerId: string;
    ownerName: string;
    ownerImage: string | null;
    totalApplications: number;
}

export async function listsSharedWithUser(client: Client, args: ListsSharedWithUserArgs): Promise<ListsSharedWithUserRow[]> {
    const result = await client.query({
        text: listsSharedWithUserQuery,
        values: [args.userId, args.maxLists],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            name: row[1],
            description: row[2],
            updatedAt: row[3],
            ownerId: row[4],
            ownerName: row[5],
            ownerImage: row[6],
            totalApplications: row[7]
        };
    });
}

export const applicationsForSharedListQuery = `-- name: ApplicationsForSharedList :many
select
    a.id,
    a.company_name,
    a.role_title,
    a.status,
    a.url,
    a.location,
    a.arrangement,
    a.pay_min,
    a.pay_max,
    a.pay_currency,
    a.pay_period,
    a.bonus_amount,
    a.pay_note,
    a.applied_at,
    a.updated_at
from applications a
where a.list_id = $1
order by a.created_at desc, a.position desc
limit $2::int`;

export interface ApplicationsForSharedListArgs {
    listId: string;
    maxApplications: number;
}

export interface ApplicationsForSharedListRow {
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

export async function applicationsForSharedList(client: Client, args: ApplicationsForSharedListArgs): Promise<ApplicationsForSharedListRow[]> {
    const result = await client.query({
        text: applicationsForSharedListQuery,
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

