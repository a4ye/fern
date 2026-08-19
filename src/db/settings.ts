import { getPool } from "@/db/client";
import * as gen from "@/db/gen/settings_sql";
import { DEFAULT_CURRENCY } from "@/lib/pay";

export type UserSettings = {
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
};

// A user who has never changed a preference has no row, so a read falls back to
// the same values the columns default to.
const DEFAULT_SETTINGS: UserSettings = {
    defaultCurrency: DEFAULT_CURRENCY,
    cleanLinks: true,
    employerLinks: false,
};

export const getUserSettings = async (
    userId: string,
): Promise<UserSettings> => {
    const row = await gen.getUserSettings(getPool(), { userId });
    return row
        ? {
              defaultCurrency: row.defaultCurrency,
              cleanLinks: row.cleanLinks,
              employerLinks: row.employerLinks,
          }
        : DEFAULT_SETTINGS;
};

export const saveUserSettings = async (
    userId: string,
    settings: UserSettings,
): Promise<void> => {
    await gen.saveUserSettings(getPool(), {
        userId,
        defaultCurrency: settings.defaultCurrency,
        cleanLinks: settings.cleanLinks,
        employerLinks: settings.employerLinks,
    });
};
