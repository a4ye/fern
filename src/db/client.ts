import * as Sentry from "@sentry/nextjs";
import { Pool, type PoolClient } from "@neondatabase/serverless";

// Generated statements head themselves with `-- name: UpdateApplication :one`,
// which names a span better than the SQL beneath it would. Anything else falls
// back to the verb it opens with.
const STATEMENT_NAME = /^\s*--\s*name:\s*(\S+)/;

export const statementName = (sql: string) =>
    sql.match(STATEMENT_NAME)?.[1] ??
    (sql.trim().split(/\s+/)[0] || "query").toLowerCase();

type Queryable = { query: (...args: unknown[]) => unknown };

// The pool lends the same client object out again on the next checkout, so this
// has to be idempotent. Wrapping twice would time a statement inside its own
// span.
const traced = new WeakSet<object>();

// Without this a slow trace says only that a handler was slow, and the time
// inside it goes unaccounted for. A span per statement says which one.
const traceQueries = <Target extends object>(target: Target): Target => {
    if (traced.has(target)) return target;
    traced.add(target);

    const queryable = target as unknown as Queryable;
    const run = queryable.query.bind(queryable);

    queryable.query = (...args: unknown[]) => {
        const first = args[0];
        const sql =
            typeof first === "string"
                ? first
                : typeof (first as { text?: unknown })?.text === "string"
                  ? (first as { text: string }).text
                  : null;
        // The callback form answers through its callback rather than a promise,
        // so there would be nothing for a span to close over.
        if (sql === null || typeof args.at(-1) === "function") {
            return run(...args);
        }

        return Sentry.startSpan(
            {
                op: "db.query",
                name: statementName(sql),
                attributes: {
                    "db.system": "postgresql",
                    // The statement is parameterised and carries no user data.
                    // The values it runs with do, and stay off the span.
                    "db.statement": sql,
                },
            },
            () => run(...args),
        );
    };
    return target;
};

let pool: Pool | undefined;

export function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.POSTGRES_URL;
        if (!connectionString) {
            throw new Error(
                "POSTGRES_URL environment variable is not set. " +
                    "Copy .env.example to .env and set your Neon connection string.",
            );
        }
        pool = new Pool({
            connectionString,
            // One instance serves many requests at once, so this is the ceiling
            // on how much of a page load can happen in parallel. The connection
            // string points at Neon's pooler, which is what actually rations the
            // database's connections, so holding a few more here costs it
            // nothing. Measured against this database, fifty concurrent reads
            // take 469ms at 5 and 311ms at 20; past 20 the round trip is the
            // limit rather than the pool, so there is nothing further to buy.
            max: 20,
            connectionTimeoutMillis: 5_000,
            idleTimeoutMillis: 10_000,
            query_timeout: 15_000,
        });
        // An idle connection can be closed from the far side, and on a frozen
        // serverless instance idleTimeoutMillis never fires to close it first.
        // The pool reports that as an `error` event, which Node escalates to a
        // fatal uncaught exception when nothing listens. Only idle connections
        // reach here, already evicted from the pool, so no query was affected
        // and there is nothing to do but let the pool open a fresh one.
        pool.on("error", () => {});
        traceQueries(pool);
    }
    return pool;
}

// A transaction must stay on one checked-out connection. Calling pool.query()
// for each statement can move those statements between connections and would
// make BEGIN/COMMIT ineffective.
export const withTransaction = async <Result>(
    operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> => {
    const client = traceQueries(await getPool().connect());
    let discardClient = false;
    // The pool takes its own error listener off a client while that client is
    // checked out, so for the length of the transaction this is the only one.
    // Without it a connection that dies here raises an `error` event with
    // nothing listening, and Node escalates that to a fatal uncaught
    // exception. The failure itself still reaches the caller, because the same
    // error rejects the in-flight query, so all this has to do is keep the
    // process alive and keep the dead connection out of the pool.
    const onClientError = () => {
        discardClient = true;
    };
    client.on("error", onClientError);

    try {
        await client.query("begin");
        const result = await operation(client);
        await client.query("commit");
        return result;
    } catch (error) {
        try {
            await client.query("rollback");
        } catch {
            // A connection that cannot roll back must not return to the pool.
            discardClient = true;
        }
        throw error;
    } finally {
        // The pool reuses the same client object, so leaving this attached
        // would stack up a listener per checkout.
        client.removeListener("error", onClientError);
        client.release(discardClient);
    }
};
