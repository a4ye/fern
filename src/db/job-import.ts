import { getPool } from "@/db/client";
import * as gen from "@/db/gen/job_import_sql";
import { takeRateLimit } from "@/db/gen/rate_limits_sql";
import { isScrapedPosting, type ScrapedPosting } from "@/lib/job-import/shared";
import { RATE_LIMITS } from "@/lib/limits";

export const getCachedJobImport = async (
    url: string,
): Promise<ScrapedPosting | null> => {
    const row = await gen.getCachedJobImport(getPool(), { url });
    return row && isScrapedPosting(row.posting) ? row.posting : null;
};

export const putCachedJobImport = async (
    url: string,
    posting: ScrapedPosting,
): Promise<void> => {
    await gen.putCachedJobImport(getPool(), { url, postingJson: posting });
};

// The user budget prevents one account from exhausting a provider's shared
// allowance. The provider budget is the distributed guard the remote site sees.
export const acquireJobImportBudget = async (
    userId: string,
    providerHost: string,
    providerRequestCost: number,
): Promise<boolean> => {
    const result = await gen.takeJobImportBudgets(getPool(), {
        userScopeKey: `scrape:${userId}`,
        providerScopeKey: `provider:${providerHost}`,
        providerRequestCost,
        // Both budgets are counted in the same window, which is what lets one
        // statement take them together.
        windowSeconds: RATE_LIMITS.scrapeUser.windowSeconds,
        userRequestLimit: RATE_LIMITS.scrapeUser.requests,
        providerRequestLimit: RATE_LIMITS.scrapeProvider.requests,
    });
    return result?.allowed === true;
};

// A second read from the same provider, taken when the first one came back with
// nothing and the page behind it is worth a look. Only the provider is charged:
// the account already paid for the attempt, and this side of the ledger is the
// one that has to match what the provider actually sees.
export const acquireProviderRead = async (
    providerHost: string,
): Promise<boolean> => {
    const row = await takeRateLimit(getPool(), {
        scopeKey: `provider:${providerHost}`,
        requestCost: 1,
        windowSeconds: RATE_LIMITS.scrapeProvider.windowSeconds,
        requestLimit: RATE_LIMITS.scrapeProvider.requests,
    });
    return row !== null;
};
