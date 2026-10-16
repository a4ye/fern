import { getPool } from "@/db/client";
import * as gen from "@/db/gen/settings_sql";
import { DEFAULT_CURRENCY } from "@/lib/pay";
import {
    DEFAULT_CLASSIFIER,
    isClassifier,
    type Classifier,
} from "@/lib/email/classifier";

export type UserSettings = {
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    tidyTitles: boolean;
    waterlooRankings: boolean;
    emailClassifier: Classifier;
};

// A user who has never changed a preference has no row, so a read falls back to
// the same values the columns default to.
const DEFAULT_SETTINGS: UserSettings = {
    defaultCurrency: DEFAULT_CURRENCY,
    cleanLinks: true,
    employerLinks: false,
    tidyTitles: false,
    waterlooRankings: false,
    emailClassifier: DEFAULT_CLASSIFIER,
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
              tidyTitles: row.tidyTitles,
              waterlooRankings: row.waterlooRankings,
              // The column is an enum the database enforces, but it reaches
              // here as a plain string, so an unknown value falls back rather
              // than being handed on as a model nobody can call.
              emailClassifier: isClassifier(row.emailClassifier)
                  ? row.emailClassifier
                  : DEFAULT_CLASSIFIER,
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
        tidyTitles: settings.tidyTitles,
        waterlooRankings: settings.waterlooRankings,
        emailClassifier: settings.emailClassifier,
    });
};

// No row and a null column both mean the welcome has not been dismissed yet.
export const hasOnboarded = async (userId: string): Promise<boolean> => {
    const row = await gen.getOnboardedAt(getPool(), { userId });
    return row?.onboardedAt != null;
};

export const markOnboarded = async (userId: string): Promise<void> => {
    await gen.markOnboarded(getPool(), { userId });
};
