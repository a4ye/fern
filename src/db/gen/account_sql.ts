import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const deleteUserQuery = `-- name: DeleteUser :exec
delete from "user"
where id = $1`;

export interface DeleteUserArgs {
    id: string;
}

export async function deleteUser(client: Client, args: DeleteUserArgs): Promise<void> {
    await client.query({
        text: deleteUserQuery,
        values: [args.id],
        rowMode: "array"
    });
}

