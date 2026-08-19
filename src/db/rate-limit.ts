import { getPool } from "@/db/client";
import * as gen from "@/db/gen/rate_limits_sql";
import { RATE_LIMITS, type RateLimitName } from "@/lib/limits";

// One counter per account and policy, held in the database because there is no
// single server to hold it in: a serverless instance forgets what it counted
// the moment it is recycled, and a second instance never knew.
//
// Refusing costs one upsert, and so does allowing, which is why only writes and
// the calls that spend money are checked. A read is left to be a read.
export const withinBudget = async (
    userId: string,
    policy: RateLimitName,
): Promise<boolean> => {
    const { requests, windowSeconds } = RATE_LIMITS[policy];
    const row = await gen.takeRateLimit(getPool(), {
        scopeKey: `${policy}:${userId}`,
        requestCost: 1,
        windowSeconds,
        requestLimit: requests,
    });
    return row !== null;
};
