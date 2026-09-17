import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const deleteUserQuery = `-- name: DeleteUser :exec
delete from "user"
where id = $1`;

export interface DeleteUserArgs {
    id: string;
}

export async function deleteUser(client: Client, args: DeleteUserArgs): Promise<void> {
    await client.query({
        text: deleteUserQuery,
        values: [args.id],
        rowMode: "array"
    });
}

export const oAuthClientForConsentQuery = `-- name: OAuthClientForConsent :one
select "name", "icon"
from "oauthApplication"
where "clientId" = $1 and "disabled" = false`;

export interface OAuthClientForConsentArgs {
    clientId: string;
}

export interface OAuthClientForConsentRow {
    name: string;
    icon: string | null;
}

export async function oAuthClientForConsent(client: Client, args: OAuthClientForConsentArgs): Promise<OAuthClientForConsentRow | null> {
    const result = await client.query({
        text: oAuthClientForConsentQuery,
        values: [args.clientId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        name: row[0],
        icon: row[1]
    };
}

