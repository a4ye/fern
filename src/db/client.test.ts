import { beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { PoolClient } from "@neondatabase/serverless";

process.env.POSTGRES_URL ??= "postgres://user:pass@localhost:5432/test";

// Four other db tests call mock.module("@/db/client"), which replaces the
// module for every file in the run. A query suffix resolves to a separate
// module identity, so this file gets the real one. The pool it builds never
// opens a connection: nothing here reaches past pool.connect, which is stubbed.
const unmocked = "@/db/client?real";
const { getPool, withTransaction } = (await import(
    unmocked
)) as typeof import("@/db/client");

// Stands in for a checked-out connection. Only the parts withTransaction
// touches are real; the error events are what these tests are about.
class FakeClient extends EventEmitter {
    statements: string[] = [];
    released: unknown;
    failOn: string | undefined;

    query = async (sql: string) => {
        this.statements.push(sql);
        if (sql === this.failOn) throw new Error(`cannot run ${sql}`);
        return { rows: [] };
    };

    release = (discard?: unknown) => {
        this.released = discard;
    };
}

const lend = (client: FakeClient) => {
    const pool = getPool() as unknown as {
        connect: () => Promise<PoolClient>;
    };
    pool.connect = async () => client as unknown as PoolClient;
};

// The error a dropped Neon websocket produces, which pg re-raises on whichever
// object owns the connection.
const dropped = () => new Error("Connection terminated unexpectedly");

let client: FakeClient;

beforeEach(() => {
    client = new FakeClient();
    lend(client);
});

describe("getPool", () => {
    test("an idle connection dying does not take the process down", () => {
        const pool = getPool() as unknown as EventEmitter;
        expect(pool.listenerCount("error")).toBeGreaterThan(0);
        // An `error` event with no listener throws, which is how this reached
        // production as a fatal uncaught exception.
        expect(() => pool.emit("error", dropped())).not.toThrow();
    });

    test("attaches that listener once, not once per call", () => {
        getPool();
        getPool();
        const pool = getPool() as unknown as EventEmitter;
        expect(pool.listenerCount("error")).toBe(1);
    });
});

describe("withTransaction", () => {
    test("commits and releases on success", async () => {
        const result = await withTransaction(async () => "done");
        expect(result).toBe("done");
        expect(client.statements).toEqual(["begin", "commit"]);
        expect(client.released).toBe(false);
    });

    test("guards the connection for the length of the transaction", async () => {
        await withTransaction(async (checkedOut) => {
            expect(
                (checkedOut as unknown as EventEmitter).listenerCount("error"),
            ).toBe(1);
        });
    });

    test("a connection dying mid-transaction still fails the caller", async () => {
        await expect(
            withTransaction(async (checkedOut) => {
                // pg emits on the client and rejects the in-flight query with
                // the same error. The emit comes first and is the fatal half.
                const emitter = checkedOut as unknown as EventEmitter;
                expect(() => emitter.emit("error", dropped())).not.toThrow();
                throw new Error("query rejected by the dead connection");
            }),
        ).rejects.toThrow("query rejected by the dead connection");
    });

    test("keeps a connection that cannot roll back out of the pool", async () => {
        client.failOn = "rollback";
        await expect(
            withTransaction(async () => {
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        expect(client.statements).toEqual(["begin", "rollback"]);
        expect(client.released).toBe(true);
    });

    test("discards the connection even when rollback succeeds", async () => {
        await expect(
            withTransaction(async (checkedOut) => {
                (checkedOut as unknown as EventEmitter).emit(
                    "error",
                    dropped(),
                );
                throw dropped();
            }),
        ).rejects.toThrow();
        expect(client.statements).toEqual(["begin", "rollback"]);
        expect(client.released).toBe(true);
    });

    test("leaves no listener behind, so reuse cannot stack them up", async () => {
        await withTransaction(async () => undefined);
        await withTransaction(async () => undefined);
        expect(client.listenerCount("error")).toBe(0);
    });
});
