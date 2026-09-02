import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TOO_MANY_REQUESTS } from "@/lib/limits";

const spy = () => mock(async (..._args: unknown[]) => {});

let session: { user: { id: string } } | null = null;
let cachedImport: Record<string, unknown> | null = null;
let importBudget = true;
// Whether the provider has budget left for the second read a miss would need.
let providerRead = true;
let writeBudget = true;
let quota: { ok: true } | { ok: false; error: string } = { ok: true };
// Which of a bulk selection can record no further moves. None by default, so a
// test says nothing about the event cap unless it means to.
let atEventCap = new Set<string>();

const db = {
    createList: spy(),
    updateList: spy(),
    deleteList: spy(),
    setListPinned: spy(),
    // Unused here, but actions.ts imports them from the same module, so the
    // mock has to provide them for the import to resolve.
    createApplication: spy(),
    updateApplication: spy(),
    updateApplications: spy(),
    saveApplicationDetailAndSteps: spy(),
    getApplicationExtras: spy(),
    deleteApplication: spy(),
    deleteApplications: spy(),
    setApplicationsStatus: spy(),
    setApplicationsArrangement: spy(),
};

const revalidatePath = mock((..._args: unknown[]) => {});
const getCachedJobImport = mock(async () => cachedImport);
const acquireJobImportBudget = mock(
    async (..._args: unknown[]) => importBudget,
);
const putCachedJobImport = mock(async () => {});
const restoreHistoryVersion = mock(async (..._args: unknown[]) => ({
    ok: true,
}));
const undoHistoryAction = mock(async (..._args: unknown[]) => ({ ok: true }));
const permanentlyDeleteApplication = mock(async (..._args: unknown[]) => ({
    ok: true,
}));
const permanentlyDeleteDeletedApplication = mock(
    async (..._args: unknown[]) => ({ ok: true }),
);
const clearListHistoryDb = mock(async (..._args: unknown[]) => ({ ok: true }));
const getListHistoryApplicationsPage = mock(async (..._args: unknown[]) => ({
    applications: ["Application 11"],
    page: 1,
    pageCount: 3,
    total: 25,
}));
const getListHistoryChangesPage = mock(async (..._args: unknown[]) => ({
    changes: [],
    offset: 8,
    total: 30,
}));

mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("next/cache", () => ({ revalidatePath }));
mock.module("next/server", () => ({ after: () => {} }));
mock.module("@/lib/auth", () => ({
    auth: { api: { getSession: async () => session } },
}));
mock.module("@/db/dashboard", () => db);
mock.module("@/db/settings", () => ({
    getUserSettings: async () => ({ defaultCurrency: "USD" }),
}));
mock.module("@/db/job-import", () => ({
    getCachedJobImport,
    acquireJobImportBudget,
    acquireProviderRead: async () => providerRead,
    putCachedJobImport,
}));
mock.module("@/db/rate-limit", () => ({
    withinBudget: async () => writeBudget,
}));
mock.module("@/db/quotas", () => ({
    listQuota: async () => quota,
    applicationQuota: async () => quota,
    statusEventQuota: async () => quota,
    applicationsAtEventCap: async () => atEventCap,
}));
mock.module("@/db/history", () => ({
    HISTORY_LOAD_PAGE_SIZE: 20,
    getListHistory: async () => ({
        items: [],
        nextCursor: null,
        hasMore: false,
    }),
    getListHistoryApplicationsPage,
    getListHistoryChangesPage,
    restoreHistoryVersion,
    undoHistoryAction,
    permanentlyDeleteApplication,
    permanentlyDeleteDeletedApplication,
    clearListHistory: clearListHistoryDb,
}));

const {
    addApplication,
    createList,
    saveApplicationDetail,
    updateList,
    updateApplicationsBulk,
    deleteList,
    loadListHistoryApplications,
    loadListHistoryChanges,
    permanentlyRemoveApplication,
    permanentlyRemoveDeletedApplication,
    resolveImportedLocation,
    searchImportedLocations,
    clearListHistory,
    restoreListHistoryVersion,
    setApplicationsArrangement,
    setApplicationsStatus,
    suggestFromUrl,
    togglePin,
} = await import("@/app/dashboard/actions");

const SIGNED_OUT = { ok: false, error: "You are not signed in." };
const APPLICATION_ID = "00000000-0000-4000-8000-000000000001";
const revalidated = () => revalidatePath.mock.calls.flat();

beforeEach(() => {
    session = { user: { id: "user-1" } };
    cachedImport = null;
    importBudget = true;
    providerRead = true;
    writeBudget = true;
    quota = { ok: true };
    atEventCap = new Set();
    revalidatePath.mockClear();
    for (const fn of Object.values(db)) fn.mockClear();
    getCachedJobImport.mockClear();
    acquireJobImportBudget.mockClear();
    putCachedJobImport.mockClear();
    restoreHistoryVersion.mockClear();
    undoHistoryAction.mockClear();
    permanentlyDeleteApplication.mockClear();
    permanentlyDeleteDeletedApplication.mockClear();
    clearListHistoryDb.mockClear();
    getListHistoryApplicationsPage.mockClear();
    getListHistoryChangesPage.mockClear();
});

describe("suggestFromUrl", () => {
    const posting = {
        company: "Acme",
        role: "Engineer",
        location: null,
        arrangement: null,
        pay: null,
        payNote: null,
        source: "json-ld",
        employerUrl: null,
    } as const;

    it("does not fetch arbitrary employer domains on the backend", async () => {
        expect(await suggestFromUrl("https://careers.acme.com/job/1")).toEqual({
            status: "unsupported",
            posting: {
                company: null,
                role: null,
                location: null,
                arrangement: null,
                pay: null,
                payNote: null,
                source: "none",
                employerUrl: null,
            },
        });
        expect(acquireJobImportBudget).not.toHaveBeenCalled();
    });

    it("serves a shared cached ATS result without spending rate budget", async () => {
        cachedImport = posting;
        expect(
            await suggestFromUrl("https://jobs.lever.co/acme/engineer"),
        ).toEqual({ status: "found", posting });
        expect(acquireJobImportBudget).not.toHaveBeenCalled();
    });

    it("stops a supported-provider fallback when its budget is exhausted", async () => {
        importBudget = false;
        const result = await suggestFromUrl(
            "https://jobs.lever.co/acme/engineer",
        );
        expect(result.status).toBe("rate-limited");
        expect(acquireJobImportBudget.mock.calls[0]).toEqual([
            "user-1",
            "jobs.lever.co",
            1,
        ]);
    });
});

describe("resolveImportedLocation", () => {
    it("does not expose the city index to signed-out callers", async () => {
        session = null;
        expect(await resolveImportedLocation("London")).toEqual({
            status: "unmatched",
        });
    });

    it("settles common locations without loading the complete fallback", async () => {
        expect(await resolveImportedLocation("Canada, Toronto")).toEqual({
            status: "matched",
            location: "Toronto, Ontario, Canada",
        });
    });
});

describe("searchImportedLocations", () => {
    it("does not expose worldwide suggestions to signed-out callers", async () => {
        session = null;
        expect(await searchImportedLocations("Gue")).toEqual([]);
    });

    it("returns indexed prefix and ambiguity suggestions", async () => {
        expect(await searchImportedLocations("Gue")).toContain(
            "Guelph, Ontario, Canada",
        );
        expect((await searchImportedLocations("Londn")).slice(0, 2)).toEqual([
            "London, England, United Kingdom",
            "London, Ontario, Canada",
        ]);
        expect((await searchImportedLocations("cambrid")).slice(0, 3)).toEqual([
            "Cambridge, Massachusetts, United States",
            "Cambridge, England, United Kingdom",
            "Cambridge, Ontario, Canada",
        ]);
    });
});

describe("createList", () => {
    it("refuses to write when signed out", async () => {
        session = null;
        expect(await createList("Fall 2026", null)).toEqual(SIGNED_OUT);
        expect(db.createList).not.toHaveBeenCalled();
    });

    it("inserts under the session user with validated values", async () => {
        expect(await createList("  Fall 2026  ", "   ")).toEqual({ ok: true });
        expect(db.createList.mock.calls[0]).toEqual([
            "user-1",
            "Fall 2026",
            null,
        ]);
        expect(revalidated()).toContain("/dashboard");
    });

    it("reports invalid input without writing", async () => {
        expect(await createList("   ", null)).toEqual({
            ok: false,
            error: "Name is required.",
        });
        expect(db.createList).not.toHaveBeenCalled();
    });

    it("refuses to write once the account is out of budget", async () => {
        writeBudget = false;
        expect(await createList("Fall 2026", null)).toEqual({
            ok: false,
            error: TOO_MANY_REQUESTS,
        });
        expect(db.createList).not.toHaveBeenCalled();
    });

    it("passes on the reason when there is no room for another list", async () => {
        quota = { ok: false, error: "You can keep 100 lists." };
        expect(await createList("Fall 2026", null)).toEqual(quota);
        expect(db.createList).not.toHaveBeenCalled();
    });
});

describe("updateList", () => {
    const edit = {
        name: "Fall 2026",
        description: "New grad roles",
        status: "archived" as const,
    };

    it("refuses to write when signed out", async () => {
        session = null;
        expect(await updateList("list-1", edit)).toEqual(SIGNED_OUT);
        expect(db.updateList).not.toHaveBeenCalled();
    });

    it("saves under the session user and revalidates both views", async () => {
        expect(await updateList("list-1", edit)).toEqual({ ok: true });
        expect(db.updateList.mock.calls[0]).toEqual(["user-1", "list-1", edit]);
        expect(revalidated()).toEqual(["/dashboard/list-1", "/dashboard"]);
    });

    it("reports an unknown status without writing", async () => {
        const result = await updateList("list-1", {
            ...edit,
            status: "deleted" as never,
        });
        expect(result).toEqual({ ok: false, error: "Choose a valid status." });
        expect(db.updateList).not.toHaveBeenCalled();
    });
});

describe("restoreListHistoryVersion", () => {
    it("refuses to restore when signed out", async () => {
        session = null;
        expect(await restoreListHistoryVersion(APPLICATION_ID, "123")).toEqual(
            SIGNED_OUT,
        );
        expect(restoreHistoryVersion).not.toHaveBeenCalled();
    });

    it("restores only the signed-in user's validated list and version", async () => {
        expect(await restoreListHistoryVersion(APPLICATION_ID, "123")).toEqual({
            ok: true,
        });
        expect(restoreHistoryVersion.mock.calls[0]).toEqual([
            "user-1",
            APPLICATION_ID,
            "123",
        ]);
        expect(revalidated()).toEqual([
            `/dashboard/${APPLICATION_ID}`,
            "/dashboard",
        ]);
    });

    it("rejects an invalid version before reading history", async () => {
        expect(
            await restoreListHistoryVersion(APPLICATION_ID, "not-an-id"),
        ).toEqual({
            ok: false,
            error: "That version is no longer available.",
        });
        expect(restoreHistoryVersion).not.toHaveBeenCalled();
    });
});

describe("permanent history deletion", () => {
    const DELETED_APPLICATION_ID = "00000000-0000-4000-8000-000000000002";

    it("permanently deletes a current application for the signed-in user", async () => {
        expect(
            await permanentlyRemoveApplication(
                APPLICATION_ID,
                DELETED_APPLICATION_ID,
            ),
        ).toEqual({ ok: true });
        expect(permanentlyDeleteApplication.mock.calls[0]).toEqual([
            "user-1",
            APPLICATION_ID,
            DELETED_APPLICATION_ID,
        ]);
        expect(revalidated()).toEqual([
            `/dashboard/${APPLICATION_ID}`,
            "/dashboard",
        ]);
    });

    it("permanently deletes an application represented by a History entry", async () => {
        expect(
            await permanentlyRemoveDeletedApplication(APPLICATION_ID, "123"),
        ).toEqual({ ok: true });
        expect(permanentlyDeleteDeletedApplication.mock.calls[0]).toEqual([
            "user-1",
            APPLICATION_ID,
            "123",
        ]);
    });

    it("clears History without accepting an invalid list", async () => {
        expect(await clearListHistory(APPLICATION_ID)).toEqual({ ok: true });
        expect(clearListHistoryDb.mock.calls[0]).toEqual([
            "user-1",
            APPLICATION_ID,
        ]);

        expect(await clearListHistory("not-a-list")).toEqual({
            ok: false,
            error: "That list is no longer available.",
        });
        expect(clearListHistoryDb).toHaveBeenCalledTimes(1);
    });
});

describe("loadListHistoryApplications", () => {
    it("loads a validated page for the signed-in user's list", async () => {
        expect(
            await loadListHistoryApplications(APPLICATION_ID, "123", 2, 1),
        ).toEqual({
            applications: ["Application 11"],
            page: 1,
            pageCount: 3,
            total: 25,
        });
        expect(getListHistoryApplicationsPage.mock.calls[0]).toEqual([
            "user-1",
            APPLICATION_ID,
            "123",
            2,
            1,
        ]);
    });

    it("rejects invalid page requests before reading history", async () => {
        expect(
            await loadListHistoryApplications(
                APPLICATION_ID,
                "not-an-id",
                0,
                0,
            ),
        ).toBeNull();
        expect(
            await loadListHistoryApplications(APPLICATION_ID, "123", -1, 0),
        ).toBeNull();
        expect(
            await loadListHistoryApplications(APPLICATION_ID, "123", 0, -1),
        ).toBeNull();
        expect(getListHistoryApplicationsPage).not.toHaveBeenCalled();
    });

    it("does not read history when signed out", async () => {
        session = null;
        expect(
            await loadListHistoryApplications(APPLICATION_ID, "123", 0, 0),
        ).toBeNull();
        expect(getListHistoryApplicationsPage).not.toHaveBeenCalled();
    });
});

describe("loadListHistoryChanges", () => {
    it("loads more changes for the signed-in user's list", async () => {
        expect(await loadListHistoryChanges(APPLICATION_ID, "123", 8)).toEqual({
            changes: [],
            offset: 8,
            total: 30,
        });
        expect(getListHistoryChangesPage.mock.calls[0]).toEqual([
            "user-1",
            APPLICATION_ID,
            "123",
            8,
        ]);
    });

    it("rejects invalid requests before reading history", async () => {
        expect(
            await loadListHistoryChanges(APPLICATION_ID, "not-an-id", 8),
        ).toBeNull();
        expect(
            await loadListHistoryChanges(APPLICATION_ID, "123", -1),
        ).toBeNull();
        expect(getListHistoryChangesPage).not.toHaveBeenCalled();
    });

    it("does not read history when signed out", async () => {
        session = null;
        expect(
            await loadListHistoryChanges(APPLICATION_ID, "123", 8),
        ).toBeNull();
        expect(getListHistoryChangesPage).not.toHaveBeenCalled();
    });
});

describe("deleteList", () => {
    it("refuses to write when signed out", async () => {
        session = null;
        await deleteList("list-1");
        expect(db.deleteList).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("deletes under the session user", async () => {
        await deleteList("list-1");
        expect(db.deleteList.mock.calls[0]).toEqual(["user-1", "list-1"]);
        expect(revalidated()).toContain("/dashboard");
    });
});

describe("togglePin", () => {
    it("refuses to write when signed out", async () => {
        session = null;
        await togglePin("list-1", true);
        expect(db.setListPinned).not.toHaveBeenCalled();
    });

    it("pins and unpins under the session user", async () => {
        await togglePin("list-1", true);
        await togglePin("list-1", false);
        expect(db.setListPinned.mock.calls).toEqual([
            ["user-1", "list-1", true],
            ["user-1", "list-1", false],
        ]);
        expect(revalidated()).toEqual(["/dashboard", "/dashboard"]);
    });
});

describe("setApplicationsStatus", () => {
    it("passes a validated browser time zone to the status write", async () => {
        await setApplicationsStatus(
            "list-1",
            [APPLICATION_ID],
            "applied",
            "America/Toronto",
        );

        expect(db.setApplicationsStatus.mock.calls[0]).toEqual([
            "user-1",
            [APPLICATION_ID],
            "applied",
            "America/Toronto",
        ]);
        expect(revalidated()).toEqual(["/dashboard/list-1", "/dashboard"]);
    });

    it("rejects an invalid time zone before writing", async () => {
        await setApplicationsStatus(
            "list-1",
            [APPLICATION_ID],
            "applied",
            "Moon/Sea_of_Tranquility",
        );

        expect(db.setApplicationsStatus).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("writes only the applications that can still record the move", async () => {
        const other = "00000000-0000-4000-8000-000000000002";
        atEventCap = new Set([other]);
        await setApplicationsStatus(
            "list-1",
            [APPLICATION_ID, other],
            "applied",
            "America/Toronto",
        );

        expect(db.setApplicationsStatus.mock.calls[0][1]).toEqual([
            APPLICATION_ID,
        ]);
    });

    it("says why when every application is at its cap", async () => {
        atEventCap = new Set([APPLICATION_ID]);
        const result = await setApplicationsStatus(
            "list-1",
            [APPLICATION_ID],
            "applied",
            "America/Toronto",
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("status changes");
        expect(db.setApplicationsStatus).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    // The table applies these before the server answers, so a refusal has to
    // come back as one for the row to be put back and the reason shown.
    it("reports being out of budget rather than failing silently", async () => {
        writeBudget = false;
        expect(
            await setApplicationsStatus(
                "list-1",
                [APPLICATION_ID],
                "applied",
                "America/Toronto",
            ),
        ).toEqual({ ok: false, error: TOO_MANY_REQUESTS });
        expect(db.setApplicationsStatus).not.toHaveBeenCalled();
    });
});

describe("application write revalidation", () => {
    const quickEdit = {
        company: "Acme",
        role: null,
        status: "applied" as const,
        location: null,
        arrangement: null,
        pay: null,
        appliedAt: null,
        url: null,
    };
    const detailEdit = {
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
    };

    it("refreshes the list detail and overview after creating an application", async () => {
        await addApplication(
            "list-1",
            { ...detailEdit, status: "not_applied" },
            "America/Toronto",
        );

        expect(revalidated()).toEqual(["/dashboard/list-1", "/dashboard"]);
    });

    it("refreshes the list detail and overview after bulk editing applications", async () => {
        await updateApplicationsBulk(
            "list-1",
            [{ id: APPLICATION_ID, input: quickEdit, payTyped: false }],
            "America/Toronto",
        );

        expect(revalidated()).toEqual(["/dashboard/list-1", "/dashboard"]);
    });

    it("refreshes the list detail and overview after editing application details", async () => {
        await saveApplicationDetail(
            "list-1",
            "app-1",
            detailEdit,
            { removed: [], added: [] },
            "America/Toronto",
        );

        expect(revalidated()).toEqual(["/dashboard/list-1", "/dashboard"]);
    });

    it("refreshes the list detail and overview after changing arrangement", async () => {
        await setApplicationsArrangement("list-1", [APPLICATION_ID], "remote");

        expect(revalidated()).toEqual(["/dashboard/list-1", "/dashboard"]);
    });
});
