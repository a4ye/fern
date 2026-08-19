import { Pool, type PoolClient } from "@neondatabase/serverless";

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
    }
    return pool;
}

// A transaction must stay on one checked-out connection. Calling pool.query()
// for each statement can move those statements between connections and would
// make BEGIN/COMMIT ineffective.
export const withTransaction = async <Result>(
    operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> => {
    const client = await getPool().connect();
    let discardClient = false;

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
        client.release(discardClient);
    }
};
