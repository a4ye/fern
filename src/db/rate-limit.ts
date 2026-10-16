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

// A budget the whole app shares rather than one account's, counted in whatever
// unit the provider counts in. TypeSafe applies its limits across every key in
// the organisation and across simultaneous requests, so the counter has to be
// somewhere every instance can see, which is here for the same reason the
// per-account ones are: an instance forgets what it counted when it recycles,
// and the instance beside it never knew.
//
// Taken once for a whole group of emails rather than once per email. The reply
// to one is a few hundred milliseconds and the round trip to this table is not
// far off that, so charging the group up front keeps the guard from costing
// more than the thing it guards.
export const takeSharedBudget = async (
    scopeKey: string,
    cost: number,
    limit: number,
    windowSeconds: number,
): Promise<boolean> => {
    const row = await gen.takeRateLimit(getPool(), {
        scopeKey,
        requestCost: Math.max(1, Math.ceil(cost)),
        windowSeconds,
        requestLimit: limit,
    });
    return row !== null;
};
