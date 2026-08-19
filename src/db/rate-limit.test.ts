import { beforeEach, describe, expect, mock, test } from "bun:test";
import { RATE_LIMITS } from "@/lib/limits";

let allowed = true;
const takeRateLimit = mock(async (..._args: unknown[]) =>
    allowed ? { requestCount: 1 } : null,
);

// mock.module replaces the module for every test file in the run, so the shape
// here has to be the whole module, not just the part this file touches.
mock.module("@/db/client", () => ({
    getPool: () => ({}),
    withTransaction: async (operation: (client: object) => Promise<unknown>) =>
        operation({}),
}));
mock.module("@/db/gen/rate_limits_sql", () => ({ takeRateLimit }));

const { withinBudget } = await import("@/db/rate-limit");

const args = () => takeRateLimit.mock.calls[0][1] as Record<string, unknown>;

beforeEach(() => {
    allowed = true;
    takeRateLimit.mockClear();
});

describe("withinBudget", () => {
    test("spends one request of the named policy", async () => {
        await withinBudget("user-1", "inbox");
        expect(args()).toMatchObject({
            requestCost: 1,
            windowSeconds: RATE_LIMITS.inbox.windowSeconds,
            requestLimit: RATE_LIMITS.inbox.requests,
        });
    });

    test("counts each policy against a key of its own", async () => {
        await withinBudget("user-1", "write");
        expect(args().scopeKey).toBe("write:user-1");
    });

    test("is refused when the budget is spent", async () => {
        allowed = false;
        expect(await withinBudget("user-1", "write")).toBe(false);
    });
});
