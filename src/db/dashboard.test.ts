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

type EventRow = {
    id: string;
    applicationId: string;
    fromStatus: string | null;
    toStatus: string | null;
    occurredAt: Date;
};

let total = 0;
let rows: Row[] = [];
let applications: Record<string, unknown>[] = [];
let statusEvents: EventRow[] = [];

const countListsForUser = mock(async (..._args: unknown[]) => ({ total }));
const listListsForUser = mock(async (..._args: unknown[]) => rows);
const getListForUser = mock(async (..._args: unknown[]) => row());
const listApplicationsForList = mock(
    async (..._args: unknown[]) => applications,
);
const pipelineForList = mock(async (..._args: unknown[]) => []);
const recentEventsForList = mock(async (..._args: unknown[]) => []);
const statusEventsForList = mock(async (..._args: unknown[]) => statusEvents);

mock.module("@/db/client", () => ({ getPool: () => ({}) }));
mock.module("@/db/queries", () => ({
    countListsForUser,
    listListsForUser,
    getListForUser,
    listApplicationsForList,
    pipelineForList,
    recentEventsForList,
    statusEventsForList,
}));

const { getListDetail, getListsForUser } = await import("@/db/dashboard");

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

const application = (status: string) => ({
    id: "app-1",
    companyName: "Circleback",
    roleTitle: "Backend",
    status,
    url: null,
    location: null,
    arrangement: null,
    notes: null,
    payMin: null,
    payMax: null,
    payCurrency: "USD",
    payPeriod: null,
    bonusAmount: null,
    payNote: null,
    appliedAt: null,
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
});

const event = (
    from: string | null,
    to: string,
    id = `event-${to}`,
): EventRow => ({
    id,
    applicationId: "app-1",
    fromStatus: from,
    toStatus: to,
    occurredAt: new Date("2026-08-04T12:00:00.000Z"),
});

const detail = async () => {
    const loaded = await getListDetail("user-1", "list-1");
    if (!loaded) throw new Error("expected a list");
    return loaded;
};

describe("getListDetail", () => {
    it("counts a status recorded twice as two steps of its own", async () => {
        applications = [application("interviewing")];
        statusEvents = [
            event("applied", "interviewing", "first"),
            event("interviewing", "interviewing", "second"),
        ];
        const { applications: loaded, flow } = await detail();

        expect(loaded[0].history.map((step) => step.status)).toEqual([
            "applied",
            "interviewing",
            "interviewing",
        ]);
        expect(flow[0].history).toEqual(loaded[0].history.map((s) => s.status));
    });

    it("leaves the opening step with no event to take back", async () => {
        applications = [application("interviewing")];
        statusEvents = [event("applied", "interviewing", "first")];
        const { applications: loaded } = await detail();

        expect(loaded[0].history.map((step) => step.id)).toEqual([
            null,
            "first",
        ]);
    });

    it("gives an application that never moved a history of where it sits", async () => {
        applications = [application("not_applied")];
        statusEvents = [];
        const { applications: loaded } = await detail();

        expect(loaded[0].history).toEqual([
            { id: null, status: "not_applied", at: null },
        ]);
    });

    it("ends the history where the row is, even if no step recorded it", async () => {
        // The bulk toolbar writes the event and the status separately, so a
        // status that arrived some other way still has to close the trail.
        applications = [application("rejected")];
        statusEvents = [event("applied", "interviewing", "first")];
        const { applications: loaded } = await detail();

        expect(loaded[0].history.map((step) => step.status)).toEqual([
            "applied",
            "interviewing",
            "rejected",
        ]);
    });
});

describe("parseListSort", () => {
    it("falls back to recent for a missing or unknown sort", () => {
        expect(parseListSort(undefined)).toBe("recent");
        expect(parseListSort("bogus")).toBe("recent");
        expect(parseListSort("applications")).toBe("applications");
    });
});
