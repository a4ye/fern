import { Pool } from "@neondatabase/serverless";

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
