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

// What the consent screen is being asked to approve, read from the code the
// flow issued. Null when the code is unknown, has lapsed, or names a client
// that has since been disabled, all of which the page turns away the same way.
export type ConsentRequest = {
    clientName: string;
    // The host the grant would be sent to. A client picks its own name at
    // registration, so the name alone tells nobody whether this is the app they
    // meant; where the data goes is the part it cannot dress up.
    redirectHost: string | null;
    userId: string | null;
    scopes: string[];
};

export const oauthConsentRequest = async (
    consentCode: string,
): Promise<ConsentRequest | null> => {
    const row = await gen.oAuthConsentRequest(getPool(), { consentCode });
    if (!row) return null;

    return {
        clientName: row.name,
        redirectHost: hostOf(row.redirectUri),
        userId: row.userId,
        scopes: scopeList(row.scope),
    };
};

// The scope is held as a JSON array inside the request. An unreadable one is
// read as no scope at all, which is the widest grant and so the one the page
// describes in full: a consent screen that understated what it was approving
// because a field would not parse would be the wrong way to fail.
const scopeList = (scope: string | null): string[] => {
    if (!scope) return [];
    try {
        const parsed: unknown = JSON.parse(scope);
        return Array.isArray(parsed)
            ? parsed.filter((entry) => typeof entry === "string")
            : [];
    } catch {
        return [];
    }
};

const hostOf = (url: string | null): string | null => {
    if (!url) return null;
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
};
