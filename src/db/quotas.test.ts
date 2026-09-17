import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
    MAX_APPLICATIONS,
    MAX_APPLICATIONS_PER_LIST,
    MAX_EVENTS_PER_APPLICATION,
    MAX_LISTS,
} from "@/lib/limits";

let lists = 0;
let inList = 0;
let total = 0;
let events = 0;
let existingEventIds: string[] = [];

const countListsForUser = mock(async () => ({ total: lists }));
const applicationQuotaUsage = mock(async () => ({ inList, total }));
// Stands in for the `filter (where e.id = any(...))` in the real query, which
// counts the rows it matched rather than the ids it was handed. A test that
// counted the request instead would agree with the bug it is here to catch.
const countApplicationEvents = mock(
    async (_client: unknown, args: { removedEventIds: string[] }) => ({
        total: events,
        removing: args.removedEventIds.filter((id) =>
            existingEventIds.includes(id),
        ).length,
    }),
);
const applicationsUnderEventCap = mock(async () => [{ id: "a" }]);

// mock.module replaces the module for every test file in the run, so the shape
// here has to be the whole module, not just the part this file touches.
mock.module("@/db/client", () => ({
    getPool: () => ({}),
    withTransaction: async (operation: (client: object) => Promise<unknown>) =>
        operation({}),
}));
mock.module("@/db/gen/lists_sql", () => ({ countListsForUser }));
mock.module("@/db/gen/quotas_sql", () => ({
    applicationQuotaUsage,
    countApplicationEvents,
    applicationsUnderEventCap,
}));

const { listQuota, applicationQuota, statusEventQuota } =
    await import("@/db/quotas");

beforeEach(() => {
    lists = 0;
    inList = 0;
    total = 0;
    events = 0;
    existingEventIds = [];
});

describe("listQuota", () => {
    test("allows one more up to the last", async () => {
        lists = MAX_LISTS - 1;
        expect(await listQuota("user-1")).toMatchObject({ ok: true });
    });

    test("refuses once they are all used", async () => {
        lists = MAX_LISTS;
        expect(await listQuota("user-1")).toMatchObject({ ok: false });
    });
});

describe("applicationQuota", () => {
    test("counts what is about to be written, not just what is there", async () => {
        inList = MAX_APPLICATIONS_PER_LIST - 10;
        total = inList;
        // Ten more exactly fills the list, so eleven cannot go in.
        expect(await applicationQuota("user-1", "list-1", 10)).toMatchObject({
            ok: true,
        });
        expect(await applicationQuota("user-1", "list-1", 11)).toMatchObject({
            ok: false,
        });
    });

    test("says which ceiling was met when a list is the one that is full", async () => {
        inList = MAX_APPLICATIONS_PER_LIST;
        total = MAX_APPLICATIONS_PER_LIST;
        const result = await applicationQuota("user-1", "list-1", 1);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("A list holds");
    });

    test("refuses on the account total even when the list has room", async () => {
        inList = 1;
        total = MAX_APPLICATIONS;
        const result = await applicationQuota("user-1", "list-1", 1);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("You can keep");
    });
});

describe("statusEventQuota", () => {
    test("allows a save that lands on the cap", async () => {
        events = MAX_EVENTS_PER_APPLICATION - 2;
        expect(await statusEventQuota("user-1", "app-1", 2)).toMatchObject({
            ok: true,
        });
    });

    test("refuses the save that would pass it", async () => {
        events = MAX_EVENTS_PER_APPLICATION - 2;
        expect(await statusEventQuota("user-1", "app-1", 3)).toMatchObject({
            ok: false,
        });
    });

    test("counts a dropped step as room once it is really dropped", async () => {
        events = MAX_EVENTS_PER_APPLICATION;
        existingEventIds = ["event-1"];
        expect(
            await statusEventQuota("user-1", "app-1", 1, ["event-1"]),
        ).toMatchObject({ ok: true });
    });

    // The delete matches removals by id, so an id this application does not
    // hold drops nothing. Subtracting it anyway is what let a save at the cap
    // add a hundred more by naming a hundred ids that were never there.
    test("gives no room for removals the application does not hold", async () => {
        events = MAX_EVENTS_PER_APPLICATION;
        existingEventIds = [];
        expect(
            await statusEventQuota("user-1", "app-1", 1, ["not-a-real-event"]),
        ).toMatchObject({ ok: false });
    });
});
