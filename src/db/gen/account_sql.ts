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

export const oAuthConsentRequestQuery = `-- name: OAuthConsentRequest :one
select
    a."name",
    a."icon",
    v."value"::jsonb ->> 'userId' as user_id,
    v."value"::jsonb ->> 'redirectURI' as redirect_uri,
    -- A JSON array, handed back as its text so the page can say whether this
    -- grant is read only rather than listing what every grant can do.
    v."value"::jsonb ->> 'scope' as scope
from "verification" v
join "oauthApplication" a
    on a."clientId" = v."value"::jsonb ->> 'clientId'
where v."identifier" = $1
    and v."expiresAt" > now()
    and a."disabled" = false`;

export interface OAuthConsentRequestArgs {
    consentCode: string;
}

export interface OAuthConsentRequestRow {
    name: string;
    icon: string | null;
    userId: string | null;
    redirectUri: string | null;
    scope: string | null;
}

export async function oAuthConsentRequest(client: Client, args: OAuthConsentRequestArgs): Promise<OAuthConsentRequestRow | null> {
    const result = await client.query({
        text: oAuthConsentRequestQuery,
        values: [args.consentCode],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        name: row[0],
        icon: row[1],
        userId: row[2],
        redirectUri: row[3],
        scope: row[4]
    };
}

