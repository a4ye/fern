import {
    afterAll,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from "bun:test";
import { RATE_BASE } from "@/lib/exchange";

let cached: { rates: unknown; refresh: boolean | null } | null = null;
let reply: { ok: boolean; body: unknown } = { ok: true, body: {} };

const readCached = mock(async (..._args: unknown[]) => cached);
const saveExchangeRates = mock(async (..._args: unknown[]) => {});
const markExchangeRatesChecked = mock(async (..._args: unknown[]) => {});

// Work handed to `after` is meant to outlive the response, so the tests hold it
// and run it themselves. Nothing here would otherwise prove that a stale read
// answers before the provider does.
const deferred: (() => Promise<unknown>)[] = [];

// Spread over the real module rather than written out: mock.module replaces it
// for every test file in the run, and the proxy tests want the genuine
// NextRequest out of it.
const nextServer = await import("next/server");
mock.module("next/server", () => ({
    ...nextServer,
    after: (task: () => Promise<unknown>) => deferred.push(task),
}));
mock.module("@/db/client", () => ({
    getPool: () => ({}),
    withTransaction: async (operation: (client: object) => Promise<unknown>) =>
        operation({}),
}));
mock.module("@/db/gen/exchange_rates_sql", () => ({
    getExchangeRates: readCached,
    saveExchangeRates,
    markExchangeRatesChecked,
}));

process.env.EXCHANGE_RATE_API_KEY = "test-key";

const answer = (async () => ({
    ok: reply.ok,
    json: async () => reply.body,
})) as unknown as typeof fetch;

// Put back afterwards: every test file in the run shares one global, and the
// tests that reach the network for real are entitled to the genuine one.
const fetched = spyOn(globalThis, "fetch").mockImplementation(answer);
afterAll(() => fetched.mockRestore());

const { getExchangeRates } = await import("@/db/exchange-rates");

const settle = async () => {
    for (const task of deferred.splice(0)) await task();
};

const saved = () =>
    (saveExchangeRates.mock.calls[0][1] as { rates: Record<string, number> })
        .rates;

beforeEach(() => {
    process.env.EXCHANGE_RATE_API_KEY = "test-key";
    cached = null;
    reply = {
        ok: true,
        body: { conversion_rates: { [RATE_BASE]: 1, EUR: 0.5 } },
    };
    deferred.length = 0;
    readCached.mockClear();
    saveExchangeRates.mockClear();
    markExchangeRatesChecked.mockClear();
    fetched.mockClear();
});

describe("getExchangeRates", () => {
    test("waits on the provider when nothing has ever been cached", async () => {
        expect(await getExchangeRates()).toEqual({ [RATE_BASE]: 1, EUR: 0.5 });
        expect(saved()).toEqual({ [RATE_BASE]: 1, EUR: 0.5 });
    });

    test("serves cached rates without asking again", async () => {
        cached = { rates: { [RATE_BASE]: 1, EUR: 0.4 }, refresh: false };
        expect(await getExchangeRates()).toEqual({ [RATE_BASE]: 1, EUR: 0.4 });
        expect(fetched).not.toHaveBeenCalled();
    });

    test("answers with rates that are due, then replaces them", async () => {
        cached = { rates: { [RATE_BASE]: 1, EUR: 0.4 }, refresh: true };
        expect(await getExchangeRates()).toEqual({ [RATE_BASE]: 1, EUR: 0.4 });
        expect(fetched).not.toHaveBeenCalled();

        await settle();
        expect(saved()).toEqual({ [RATE_BASE]: 1, EUR: 0.5 });
    });

    test("drops an entry that is not a rate", async () => {
        reply = {
            ok: true,
            body: {
                conversion_rates: {
                    [RATE_BASE]: 1,
                    EUR: 0.5,
                    JPY: null,
                    GBP: 0,
                    KRW: "x",
                },
            },
        };
        expect(await getExchangeRates()).toEqual({ [RATE_BASE]: 1, EUR: 0.5 });
    });

    test("keeps the rates it holds when the provider gives nothing", async () => {
        cached = { rates: { [RATE_BASE]: 1, EUR: 0.4 }, refresh: true };
        reply = { ok: false, body: null };

        expect(await getExchangeRates()).toEqual({ [RATE_BASE]: 1, EUR: 0.4 });
        await settle();
        expect(saveExchangeRates).not.toHaveBeenCalled();
        expect(markExchangeRatesChecked).toHaveBeenCalled();
    });

    test("refuses a reply that does not quote the base against itself", async () => {
        reply = { ok: true, body: { conversion_rates: { EUR: 0.5 } } };
        expect(await getExchangeRates()).toEqual({});
        expect(saveExchangeRates).not.toHaveBeenCalled();
    });

    test("asks with the key it was given", async () => {
        await getExchangeRates();
        expect(String(fetched.mock.calls[0][0])).toContain(
            `/v6/test-key/latest/${RATE_BASE}`,
        );
    });

    test("asks nobody when no key is set", async () => {
        delete process.env.EXCHANGE_RATE_API_KEY;
        expect(await getExchangeRates()).toEqual({});
        expect(fetched).not.toHaveBeenCalled();
    });
});
