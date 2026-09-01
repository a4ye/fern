import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getUserSettingsQuery = `-- name: GetUserSettings :one
select default_currency, clean_links, employer_links, tidy_titles
from user_settings
where user_id = $1`;

export interface GetUserSettingsArgs {
    userId: string;
}

export interface GetUserSettingsRow {
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    tidyTitles: boolean;
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
        defaultCurrency: row[0],
        cleanLinks: row[1],
        employerLinks: row[2],
        tidyTitles: row[3]
    };
}

export const saveUserSettingsQuery = `-- name: SaveUserSettings :exec
insert into user_settings (user_id, default_currency, clean_links, employer_links, tidy_titles)
values ($1, $2, $3, $4, $5)
on conflict (user_id) do update
set default_currency = excluded.default_currency,
    clean_links = excluded.clean_links,
    employer_links = excluded.employer_links,
    tidy_titles = excluded.tidy_titles,
    updated_at = now()`;

export interface SaveUserSettingsArgs {
    userId: string;
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    tidyTitles: boolean;
}

export async function saveUserSettings(client: Client, args: SaveUserSettingsArgs): Promise<void> {
    await client.query({
        text: saveUserSettingsQuery,
        values: [args.userId, args.defaultCurrency, args.cleanLinks, args.employerLinks, args.tidyTitles],
        rowMode: "array"
    });
}

export const getOnboardedAtQuery = `-- name: GetOnboardedAt :one
select onboarded_at
from user_settings
where user_id = $1`;

export interface GetOnboardedAtArgs {
    userId: string;
}

export interface GetOnboardedAtRow {
    onboardedAt: Date | null;
}

export async function getOnboardedAt(client: Client, args: GetOnboardedAtArgs): Promise<GetOnboardedAtRow | null> {
    const result = await client.query({
        text: getOnboardedAtQuery,
        values: [args.userId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        onboardedAt: row[0]
    };
}

export const markOnboardedQuery = `-- name: MarkOnboarded :exec
insert into user_settings (user_id, onboarded_at)
values ($1, now())
on conflict (user_id) do update
set onboarded_at = now()`;

export interface MarkOnboardedArgs {
    userId: string;
}

export async function markOnboarded(client: Client, args: MarkOnboardedArgs): Promise<void> {
    await client.query({
        text: markOnboardedQuery,
        values: [args.userId],
        rowMode: "array"
    });
}

