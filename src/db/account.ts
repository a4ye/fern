import { getPool } from "@/db/client";
import * as gen from "@/db/gen/account_sql";

// Every table that holds an account's own records points back at "user" with
// `on delete cascade`, so that one row is the whole account: its lists and the
// applications and status history beneath them, its inbox suggestions and sync
// state, its preferences, its sessions, and the provider tokens sign-in stores.
// A new table that belongs to a person must carry the same reference to be
// covered by this.
export const deleteAccount = async (userId: string): Promise<void> => {
    await gen.deleteUser(getPool(), { id: userId });
};

// What to call the application asking for access, so the consent screen names
// something the person recognises rather than the client id it arrived as.
export const oauthClientName = async (
    clientId: string,
): Promise<string | null> => {
    const row = await gen.oAuthClientForConsent(getPool(), { clientId });
    return row?.name ?? null;
};
