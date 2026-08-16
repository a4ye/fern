import { getPool } from "@/db/client";
import * as gen from "@/db/gen/job_import_sql";
import { isScrapedPosting, type ScrapedPosting } from "@/lib/job-import/shared";

const USER_REQUESTS_PER_MINUTE = 10;
const PROVIDER_REQUESTS_PER_MINUTE = 30;
const WINDOW_SECONDS = 60;

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
        userScopeKey: `user:${userId}`,
        providerScopeKey: `provider:${providerHost}`,
        providerRequestCost,
        windowSeconds: WINDOW_SECONDS,
        userRequestLimit: USER_REQUESTS_PER_MINUTE,
        providerRequestLimit: PROVIDER_REQUESTS_PER_MINUTE,
    });
    return result?.allowed === true;
};
