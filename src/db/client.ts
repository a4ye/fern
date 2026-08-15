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
        pool = new Pool({ connectionString });
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
