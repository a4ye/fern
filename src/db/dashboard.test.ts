import { beforeEach, describe, expect, it, mock } from "bun:test";
import { parseListSort } from "@/components/dashboard/data";

type Row = {
    id: string;
    name: string;
    description: string | null;
    status: string;
    pinnedAt: Date | null;
    updatedAt: Date;
    totalApplications: number;
};

let total = 0;
let rows: Row[] = [];

const countListsForUser = mock(async (..._args: unknown[]) => ({ total }));
const listListsForUser = mock(async (..._args: unknown[]) => rows);

mock.module("@/db/client", () => ({ getPool: () => ({}) }));
mock.module("@/db/queries", () => ({ countListsForUser, listListsForUser }));

const { getListsForUser } = await import("@/db/dashboard");

const row = (overrides: Partial<Row> = {}): Row => ({
    id: "list-1",
    name: "Fall 2026",
    description: null,
    status: "active",
    pinnedAt: null,
    updatedAt: new Date("2026-07-01T12:00:00.000Z"),
    totalApplications: 3,
    ...overrides,
});

const load = (page: number) =>
    getListsForUser("user-1", {
        search: "",
        sort: "recent",
        page,
        pageSize: 8,
    });

const queryArgs = () => listListsForUser.mock.calls[0]?.[1];

beforeEach(() => {
    total = 0;
    rows = [];
    countListsForUser.mockClear();
    listListsForUser.mockClear();
});

describe("getListsForUser", () => {
    it("scopes the query to the user and pages from the requested offset", async () => {
        total = 20;
        const result = await getListsForUser("user-1", {
            search: "grad",
            sort: "name",
            page: 2,
            pageSize: 8,
        });

        expect(result).toMatchObject({ total: 20, page: 2, pageCount: 3 });
        expect(queryArgs()).toEqual({
            userId: "user-1",
            search: "grad",
            sort: "name",
            pageLimit: 8,
            pageOffset: 8,
        });
        expect(countListsForUser.mock.calls[0]?.[1]).toEqual({
            userId: "user-1",
            search: "grad",
        });
    });

    it("clamps a page past the end to the last page", async () => {
        total = 20;
        const result = await load(99);

        expect(result.page).toBe(3);
        expect(queryArgs()).toMatchObject({ pageOffset: 16 });
    });

    it("clamps a page below one, so the offset is never negative", async () => {
        total = 20;
        const result = await load(0);

        expect(result.page).toBe(1);
        expect(queryArgs()).toMatchObject({ pageOffset: 0 });
    });

    it("reports one empty page when nothing matches", async () => {
        const result = await load(1);

        expect(result).toEqual({ lists: [], total: 0, page: 1, pageCount: 1 });
    });

    it("maps a row to a list summary", async () => {
        total = 2;
        rows = [
            row({ id: "pinned", pinnedAt: new Date("2026-06-01T00:00:00Z") }),
            row({ id: "plain", description: "New grad roles" }),
        ];
        const { lists } = await load(1);

        expect(lists[0]).toEqual({
            id: "pinned",
            name: "Fall 2026",
            description: null,
            status: "active",
            pinned: true,
            updatedAt: "2026-07-01T12:00:00.000Z",
            totalApplications: 3,
        });
        expect(lists[1]).toMatchObject({
            pinned: false,
            description: "New grad roles",
        });
    });
});

describe("parseListSort", () => {
    it("falls back to recent for a missing or unknown sort", () => {
        expect(parseListSort(undefined)).toBe("recent");
        expect(parseListSort("bogus")).toBe("recent");
        expect(parseListSort("applications")).toBe("applications");
    });
});
