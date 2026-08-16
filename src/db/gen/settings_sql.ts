import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getUserSettingsQuery = `-- name: GetUserSettings :one
select default_currency
from user_settings
where user_id = $1`;

export interface GetUserSettingsArgs {
    userId: string;
}

export interface GetUserSettingsRow {
    defaultCurrency: string;
}

export async function getUserSettings(client: Client, args: GetUserSettingsArgs): Promise<GetUserSettingsRow | null> {
    const result = await client.query({
        text: getUserSettingsQuery,
        values: [args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        defaultCurrency: row[0]
    };
}

export const saveUserSettingsQuery = `-- name: SaveUserSettings :exec
insert into user_settings (user_id, default_currency)
values ($1, $2)
on conflict (user_id) do update
set default_currency = excluded.default_currency,
    updated_at = now()`;

export interface SaveUserSettingsArgs {
    userId: string;
    defaultCurrency: string;
}

export async function saveUserSettings(client: Client, args: SaveUserSettingsArgs): Promise<void> {
    await client.query({
        text: saveUserSettingsQuery,
        values: [args.userId, args.defaultCurrency],
        rowMode: "array"
    });
}

