import { beforeEach, describe, expect, it, mock } from "bun:test";

const spy = () => mock(async (..._args: unknown[]) => {});

let session: { user: { id: string } } | null = null;

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
    deleteApplication: spy(),
    deleteApplications: spy(),
    setApplicationsStatus: spy(),
    setApplicationsArrangement: spy(),
};

const revalidatePath = mock((..._args: unknown[]) => {});

mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("next/cache", () => ({ revalidatePath }));
mock.module("@/lib/auth", () => ({
    auth: { api: { getSession: async () => session } },
}));
mock.module("@/db/dashboard", () => db);

const { createList, updateList, deleteList, setApplicationsStatus, togglePin } =
    await import("@/app/dashboard/actions");

const SIGNED_OUT = { ok: false, error: "You are not signed in." };
const revalidated = () => revalidatePath.mock.calls.flat();

beforeEach(() => {
    session = { user: { id: "user-1" } };
    revalidatePath.mockClear();
    for (const fn of Object.values(db)) fn.mockClear();
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
            ["app-1"],
            "applied",
            "America/Toronto",
        );

        expect(db.setApplicationsStatus.mock.calls[0]).toEqual([
            "user-1",
            ["app-1"],
            "applied",
            "America/Toronto",
        ]);
        expect(revalidated()).toContain("/dashboard/list-1");
    });

    it("rejects an invalid time zone before writing", async () => {
        await setApplicationsStatus(
            "list-1",
            ["app-1"],
            "applied",
            "Moon/Sea_of_Tranquility",
        );

        expect(db.setApplicationsStatus).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
