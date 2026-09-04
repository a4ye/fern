import { beforeEach, describe, expect, it, mock } from "bun:test";
import { parseListSort } from "@/components/dashboard/data";
import {
    MAX_APPLICATIONS_READ_PER_LIST,
    MAX_EVENTS_PER_APPLICATION,
} from "@/lib/limits";

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
let applicationEvents: EventRow[] = [];
const TIME_ZONE = "America/Toronto";
const transactionClient = { transaction: true };

const countListsForUser = mock(async (..._args: unknown[]) => ({ total }));
const listListsForUser = mock(async (..._args: unknown[]) => rows);
const listsPageForUser = mock(async (..._args: unknown[]) =>
    rows.length > 0
        ? rows.map((item, index) => ({
              ...item,
              total,
              pageOrder: String(index + 1),
          }))
        : [
              {
                  id: null,
                  name: null,
                  description: null,
                  status: null,
                  pinnedAt: null,
                  updatedAt: null,
                  totalApplications: null,
                  total,
                  pageOrder: null,
              },
          ],
);
const getListForUser = mock(async (..._args: unknown[]) => row());
const listApplicationsForList = mock(
    async (..._args: unknown[]) => applications,
);
const pipelineForList = mock(async (..._args: unknown[]) => []);
const recentEventsForList = mock(async (..._args: unknown[]) => []);
const statusEventsForList = mock(async (..._args: unknown[]) => statusEvents);
const statusEventsForApplication = mock(
    async (..._args: unknown[]) => applicationEvents,
);
const deleteApplicationEvent = mock(async (..._args: unknown[]) => undefined);
const setApplicationStatus = mock(async (..._args: unknown[]) => undefined);
const updateApplicationDetail = mock(async (..._args: unknown[]) => undefined);
const updateApplicationFields = mock(async (..._args: unknown[]) => undefined);
const updateApplicationsBulkQuery = mock(
    async (..._args: unknown[]) => undefined,
);
const applyStatusStepEditsQuery = mock(
    async (..._args: unknown[]) => undefined,
);
const lockApplicationsForUser = mock(async (..._args: unknown[]) => []);
const insertStatusEvents = mock(async (..._args: unknown[]) => undefined);
const setApplicationsStatus = mock(async (..._args: unknown[]) => undefined);
const getApplicationForUser = mock(async (..._args: unknown[]) =>
    application("applied"),
);
let applicationNotes: string | null = null;
const applicationDetailForUser = mock(async (..._args: unknown[]) => ({
    notes: applicationNotes,
}));
const insertApplicationEvent = mock(async (..._args: unknown[]) => undefined);
// How many moves the application has already recorded. Zero unless a test is
// about the cap, so nothing else has to think about it.
let applicationEventCount = 0;
const countApplicationEvents = mock(async (..._args: unknown[]) => ({
    total: applicationEventCount,
}));
const suggestion = {
    id: "suggestion-1",
    applicationId: "app-1",
    suggestedStatus: "interviewing",
    currentStatus: "applied",
};
const getSuggestionForUser = mock(
    async (..._args: unknown[]): Promise<typeof suggestion | null> =>
        suggestion,
);
const setSuggestionState = mock(async (..._args: unknown[]) => undefined);
const withTransaction = mock(
    async (operation: (client: object) => Promise<unknown>) =>
        operation(transactionClient),
);
const recordApplicationChange = mock(
    async (input: {
        mutation: (client: object, actionId: string) => Promise<unknown>;
    }) => withTransaction((client) => input.mutation(client, "101")),
);
const recordCreatedApplications = mock(
    async (input: {
        mutation: (
            client: object,
            actionId: string,
        ) => Promise<{ result: unknown }>;
    }) =>
        withTransaction(
            async (client) => (await input.mutation(client, "101")).result,
        ),
);
const recordDeletedApplications = mock(
    async (input: { mutation: (client: object) => Promise<unknown> }) =>
        withTransaction((client) => input.mutation(client)),
);
const recordListChange = mock(
    async (input: { mutation: (client: object) => Promise<unknown> }) =>
        withTransaction((client) => input.mutation(client)),
);

mock.module("@/db/client", () => ({
    getPool: () => ({}),
    withTransaction,
}));
mock.module("@/db/history", () => ({
    HISTORY_KIND: {
        create: 1,
        import: 2,
        edit: 3,
        status: 4,
        arrangement: 5,
        delete: 6,
        list: 7,
        steps: 8,
        undo: 9,
    },
    recordApplicationChange,
    recordApplicationChangeWithClient: mock(
        async (
            client: object,
            input: {
                mutation: (
                    client: object,
                    actionId: string,
                ) => Promise<unknown>;
            },
        ) => input.mutation(client, "101"),
    ),
    maintainHistoryAfterAction: mock(async () => undefined),
    recordCreatedApplications,
    recordDeletedApplications,
    recordListChange,
    getListHistory: mock(async () => ({
        items: [],
        nextCursor: null,
        hasMore: false,
    })),
    undoHistoryAction: mock(async () => ({ ok: true })),
}));
mock.module("@/db/queries", () => ({
    countListsForUser,
    listListsForUser,
    listsPageForUser,
    getListForUser,
    listApplicationsForList,
    pipelineForList,
    recentEventsForList,
    statusEventsForList,
    statusEventsForApplication,
    deleteApplicationEvent,
    setApplicationStatus,
    updateApplicationDetail,
    updateApplicationFields,
    updateApplicationsBulk: updateApplicationsBulkQuery,
    applyStatusStepEdits: applyStatusStepEditsQuery,
    lockApplicationsForUser,
    insertStatusEvents,
    setApplicationsStatus,
    getApplicationForUser,
    applicationDetailForUser,
    insertApplicationEvent,
    countApplicationEvents,
    getSuggestionForUser,
    setSuggestionState,
}));

const {
    applyStatusStepEdits,
    getApplicationExtras,
    getListDetail,
    getListInsights,
    getListsForUser,
    removeStatusStep,
    saveApplicationDetailAndSteps,
    setApplicationsStatus: setApplicationsStatusDb,
    updateApplications,
} = await import("@/db/dashboard");
const { applySuggestion } = await import("@/db/email");

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

const queryArgs = () => listsPageForUser.mock.calls.at(-1)?.[1];

beforeEach(() => {
    total = 0;
    rows = [];
    applicationEvents = [];
    applicationNotes = null;
    applicationEventCount = 0;
    countListsForUser.mockClear();
    listListsForUser.mockClear();
    listsPageForUser.mockClear();
    listApplicationsForList.mockClear();
    statusEventsForList.mockClear();
    deleteApplicationEvent.mockClear();
    setApplicationStatus.mockClear();
    updateApplicationDetail.mockClear();
    updateApplicationFields.mockClear();
    updateApplicationsBulkQuery.mockClear();
    applyStatusStepEditsQuery.mockClear();
    lockApplicationsForUser.mockClear();
    insertStatusEvents.mockClear();
    setApplicationsStatus.mockClear();
    getApplicationForUser.mockClear();
    insertApplicationEvent.mockClear();
    getSuggestionForUser.mockClear();
    setSuggestionState.mockClear();
    withTransaction.mockClear();
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
        expect(listsPageForUser).toHaveBeenCalledTimes(1);
    });

    it("clamps a page past the end to the last page", async () => {
        total = 20;
        const result = await load(99);

        expect(result.page).toBe(3);
        expect(queryArgs()).toMatchObject({ pageOffset: 16 });
        expect(listsPageForUser).toHaveBeenCalledTimes(2);
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

const insights = async () => {
    const loaded = await getListInsights("user-1", "list-1");
    if (!loaded) throw new Error("expected insights");
    return loaded;
};

// The table no longer carries a row's history, so what the list replays is the
// path the flow chart draws. The steps themselves, which the detail panel takes
// back one at a time, are read per application and covered below.
describe("getListDetail", () => {
    it("counts a status recorded twice as two steps of its own", async () => {
        applications = [application("interviewing")];
        statusEvents = [
            event("applied", "interviewing", "first"),
            event("interviewing", "interviewing", "second"),
        ];
        const { flow } = await insights();

        expect(flow[0].history).toEqual([
            "applied",
            "interviewing",
            "interviewing",
        ]);
    });

    it("gives an application that never moved a path of where it sits", async () => {
        applications = [application("not_applied")];
        statusEvents = [];
        const { flow } = await insights();

        expect(flow[0].history).toEqual(["not_applied"]);
    });

    it("ends the path where the row is, even if no step recorded it", async () => {
        // The bulk toolbar writes the event and the status separately, so a
        // status that arrived some other way still has to close the trail.
        applications = [application("rejected")];
        statusEvents = [event("applied", "interviewing", "first")];
        const { flow } = await insights();

        expect(flow[0].history).toEqual([
            "applied",
            "interviewing",
            "rejected",
        ]);
    });

    it("leaves the notes to the panel rather than sending them per row", async () => {
        applications = [application("applied")];
        const { applications: loaded } = await detail();

        expect(loaded[0]).not.toHaveProperty("notes");
        expect(loaded[0]).not.toHaveProperty("history");
    });

    it("does not read status events for the collapsed insights panel", async () => {
        applications = [application("applied")];

        await detail();

        expect(statusEventsForList).not.toHaveBeenCalled();
        expect(listApplicationsForList.mock.calls.at(-1)?.[1]).toEqual({
            listId: "list-1",
            userId: "user-1",
            maxApplications: MAX_APPLICATIONS_READ_PER_LIST,
        });
    });
});

describe("getApplicationExtras", () => {
    it("leaves the opening step with no event to take back", async () => {
        applicationEvents = [event("applied", "interviewing", "first")];
        const extras = await getApplicationExtras("user-1", "app-1");

        expect(extras?.history.map((step) => step.id)).toEqual([null, "first"]);
        expect(extras?.history.map((step) => step.status)).toEqual([
            "applied",
            "interviewing",
        ]);
    });

    it("reads only the first event for where the row started", async () => {
        applicationEvents = [
            event("applied", "interviewing", "first"),
            event("interviewing", "onsite", "second"),
        ];
        const extras = await getApplicationExtras("user-1", "app-1");

        expect(extras?.history.map((step) => step.status)).toEqual([
            "applied",
            "interviewing",
            "onsite",
        ]);
    });

    it("carries the notes the table left behind", async () => {
        applicationNotes = "Referred by a friend on the infra team.";
        const extras = await getApplicationExtras("user-1", "app-1");

        expect(extras?.notes).toBe("Referred by a friend on the infra team.");
    });
});

describe("removeStatusStep", () => {
    it("submits one set-based removal", async () => {
        await removeStatusStep("user-1", "app-1", "only", TIME_ZONE);

        expect(applyStatusStepEditsQuery).toHaveBeenCalledTimes(1);
        expect(applyStatusStepEditsQuery.mock.calls[0]?.[1]).toEqual({
            applicationId: "app-1",
            userId: "user-1",
            removedEventIds: ["only"],
            addedStatuses: [],
            timeZone: TIME_ZONE,
            historyActionId: "101",
        });
        expect(withTransaction).toHaveBeenCalledTimes(1);
    });
});

describe("applyStatusStepEdits", () => {
    it("drops the steps it was given before recording the new ones", async () => {
        await applyStatusStepEdits(
            "user-1",
            "app-1",
            {
                removed: ["first"],
                added: ["offer_in_progress"],
            },
            TIME_ZONE,
        );

        expect(applyStatusStepEditsQuery.mock.calls[0]?.[1]).toMatchObject({
            removedEventIds: ["first"],
            addedStatuses: ["offer_in_progress"],
        });
    });

    it("records queued steps in the order they were added", async () => {
        await applyStatusStepEdits(
            "user-1",
            "app-1",
            {
                removed: [],
                added: ["interviewing", "offer_in_progress"],
            },
            TIME_ZONE,
        );

        expect(applyStatusStepEditsQuery.mock.calls[0]?.[1]).toMatchObject({
            addedStatuses: ["interviewing", "offer_in_progress"],
            timeZone: TIME_ZONE,
        });
    });

    it("writes nothing when there is nothing staged", async () => {
        await applyStatusStepEdits(
            "user-1",
            "app-1",
            { removed: [], added: [] },
            TIME_ZONE,
        );

        expect(applyStatusStepEditsQuery).not.toHaveBeenCalled();
    });
});

describe("compound application writes", () => {
    const input = {
        company: "Acme",
        role: null,
        status: "interviewing" as const,
        location: null,
        arrangement: null,
        pay: null,
        appliedAt: null,
        url: null,
    };

    it("saves every bulk-edited row in one statement", async () => {
        await updateApplications(
            "user-1",
            [
                { id: "app-b", input, payTyped: false },
                { id: "app-a", input, payTyped: false },
            ],
            TIME_ZONE,
            "USD",
        );

        expect(updateApplicationsBulkQuery).toHaveBeenCalledTimes(1);
        const args = updateApplicationsBulkQuery.mock.calls[0]?.[1] as {
            rows: string;
        };
        expect(
            (JSON.parse(args.rows) as { id: string }[]).map((row) => row.id),
        ).toEqual(["app-b", "app-a"]);
        expect(withTransaction).toHaveBeenCalledTimes(1);
    });

    it("saves detail fields and staged history in one transaction", async () => {
        await saveApplicationDetailAndSteps(
            "user-1",
            "app-1",
            {
                company: "Acme",
                role: null,
                location: null,
                arrangement: null,
                appliedAt: null,
                url: null,
                payMin: null,
                payMax: null,
                payCurrency: "CAD",
                payPeriod: null,
                bonus: null,
                payNote: null,
                notes: null,
            },
            { removed: [], added: ["interviewing"] },
            TIME_ZONE,
        );

        expect(withTransaction).toHaveBeenCalledTimes(1);
        expect(updateApplicationDetail.mock.calls[0]?.[0]).toBe(
            transactionClient,
        );
        expect(applyStatusStepEditsQuery.mock.calls[0]?.[0]).toBe(
            transactionClient,
        );
    });

    it("locks a bulk selection before writing history and status", async () => {
        await setApplicationsStatusDb(
            "user-1",
            ["app-1", "app-2"],
            "rejected",
            TIME_ZONE,
        );

        expect(withTransaction).toHaveBeenCalledTimes(1);
        expect(lockApplicationsForUser.mock.calls[0]?.[0]).toBe(
            transactionClient,
        );
        expect(insertStatusEvents.mock.calls[0]?.[0]).toBe(transactionClient);
        expect(setApplicationsStatus.mock.calls[0]?.[0]).toBe(
            transactionClient,
        );
    });
});

describe("applySuggestion", () => {
    it("updates status, history, and suggestion state in one transaction", async () => {
        expect(
            await applySuggestion("user-1", "suggestion-1", "America/Toronto"),
        ).toBe(true);

        expect(withTransaction).toHaveBeenCalledTimes(1);
        expect(
            [
                ...getSuggestionForUser.mock.calls,
                ...getApplicationForUser.mock.calls,
                ...setApplicationStatus.mock.calls,
                ...insertApplicationEvent.mock.calls,
                ...setSuggestionState.mock.calls,
            ].every((call) => call[0] === transactionClient),
        ).toBe(true);
        expect(setSuggestionState.mock.calls[0]?.[1]).toMatchObject({
            id: "suggestion-1",
            state: "accepted",
        });
    });

    it("does not write when another request already resolved it", async () => {
        getSuggestionForUser.mockImplementationOnce(async () => null);

        expect(
            await applySuggestion("user-1", "suggestion-1", "America/Toronto"),
        ).toBe(false);
        expect(setApplicationStatus).not.toHaveBeenCalled();
        expect(insertApplicationEvent).not.toHaveBeenCalled();
        expect(setSuggestionState).not.toHaveBeenCalled();
    });

    it("leaves an application that has recorded its last move alone", async () => {
        applicationEventCount = MAX_EVENTS_PER_APPLICATION;

        expect(
            await applySuggestion("user-1", "suggestion-1", "America/Toronto"),
        ).toBe(true);
        expect(setApplicationStatus).not.toHaveBeenCalled();
        expect(insertApplicationEvent).not.toHaveBeenCalled();
        // Still resolved: the suggestion has been dealt with either way.
        expect(setSuggestionState.mock.calls[0]?.[1]).toMatchObject({
            state: "accepted",
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
