import { getPool } from "@/db/client";
import * as gen from "@/db/gen/admin_sql";

export type AdminUser = gen.SearchUsersRow;
export type ViewedUser = gen.GetUserByIdRow;

// One screen of accounts. An admin looking for somebody knows part of their
// address or name, so an unfiltered list is only ever the newest few.
const SEARCH_LIMIT = 50;

export const searchUsers = async (search: string): Promise<AdminUser[]> =>
    gen.searchUsers(getPool(), { search, pageLimit: SEARCH_LIMIT });

export const getUserById = async (id: string): Promise<ViewedUser | null> =>
    gen.getUserById(getPool(), { id });
