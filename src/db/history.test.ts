import { describe, expect, it } from "bun:test";
import {
    decodeHistoryActions,
    encodeHistoryActions,
    HISTORY_KIND,
    historyActionRunsMaintenance,
    historyChangeDetailsFor,
    historyChangesFor,
    historyReversalFor,
    historyStateAt,
    historyTitleFor,
    applyVersionDeltaToState,
    versionDeltaBetween,
    type StoredApplication,
    type StoredHistoryAction,
    type VersionState,
} from "@/db/history";

const actions = Array.from({ length: 500 }, (_, index) => ({
    id: String(index + 1),
    kind: 4,
    affectedCount: 1,
    data: {
        a: [
            {
                i: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
                n: `Company ${index % 25}`,
                f: { s: ["applied", "interviewing"] },
            },
        ],
    },
    reversible: true,
    occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    undoneAt: null,
})) satisfies StoredHistoryAction[];

describe("PostgreSQL history archives", () => {
    it("round-trips every action without losing granularity", () => {
        expect(decodeHistoryActions(encodeHistoryActions(actions))).toEqual(
            actions,
        );
    });

    it("compresses a representative chunk below one fifth of its JSON size", () => {
        const jsonBytes = Buffer.byteLength(JSON.stringify(actions));
        const compressedBytes = encodeHistoryActions(actions).byteLength;

        expect(compressedBytes).toBeLessThan(jsonBytes / 5);
    });

    it("checks only four writes in each block of 128 for maintenance", () => {
        expect(historyActionRunsMaintenance("127")).toBe(false);
        expect(historyActionRunsMaintenance("128")).toBe(true);
        expect(historyActionRunsMaintenance("131")).toBe(true);
        expect(historyActionRunsMaintenance("132")).toBe(false);
    });
});

const historyAction = (
    overrides: Partial<StoredHistoryAction>,
): StoredHistoryAction => ({
    id: "1",
    kind: HISTORY_KIND.edit,
    affectedCount: 1,
    data: {},
    reversible: true,
    occurredAt: "2026-01-01T00:00:00.000Z",
    undoneAt: null,
    ...overrides,
});

describe("history wording", () => {
    it("describes a reverted edit without saying undid", () => {
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.undo,
                    reversible: false,
                    data: { n: "Edited NotionGraph" },
                }),
            ),
        ).toBe("Restored previous details for NotionGraph");
    });

    it("describes a reapplied edit plainly", () => {
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.undo,
                    data: { n: "Edited NotionGraph", q: 1 },
                }),
            ),
        ).toBe("Reapplied changes to NotionGraph");
    });

    it("offers redo for a restore and undo for a reapplied change", () => {
        expect(
            historyReversalFor(
                historyAction({
                    kind: HISTORY_KIND.undo,
                    // Undo rows written before redo support have no direction;
                    // they represent a restore and should gain Redo as well.
                    data: { n: "Edited NotionGraph" },
                }),
            ),
        ).toBe("redo");
        expect(
            historyReversalFor(
                historyAction({
                    kind: HISTORY_KIND.undo,
                    data: { n: "Edited NotionGraph", q: 1 },
                }),
            ),
        ).toBe("undo");
    });

    it("writes field changes as a plain sentence", () => {
        expect(
            historyChangesFor(
                historyAction({
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "NotionGraph",
                                f: { cu: ["CAD", "AFN"] },
                            },
                        ],
                    },
                }),
            ),
        ).toEqual(["NotionGraph: Currency changed from CAD to AFN"]);
    });

    it("names a newly added application by role and company", () => {
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.create,
                    data: {
                        m: [{ n: "Northstar Labs", r: "Product Engineer" }],
                    },
                }),
            ),
        ).toBe("Added Product Engineer at Northstar Labs");

        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.create,
                    data: {
                        // Older history rows stored the created snapshot in d.
                        d: [
                            {
                                company_name: "Northstar Labs",
                                role_title: "Product Engineer",
                            },
                        ],
                    },
                }),
            ),
        ).toBe("Added Product Engineer at Northstar Labs");
    });

    it("describes application and status history updates plainly", () => {
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.edit,
                    affectedCount: 18,
                }),
            ),
        ).toBe("Updated details for 18 applications");
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.steps,
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "Northstar Labs",
                                f: {},
                            },
                        ],
                    },
                }),
            ),
        ).toBe("Changed status history for Northstar Labs");
    });

    it("uses the application role and company for a deletion", () => {
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.delete,
                    data: {
                        d: [
                            {
                                company_name: "Northstar Labs",
                                role_title: "Product Engineer",
                            },
                        ],
                    },
                }),
            ),
        ).toBe("Deleted Product Engineer at Northstar Labs");
    });

    it("does not expose deleted status rows as a separate change", () => {
        expect(
            historyChangesFor(
                historyAction({
                    kind: HISTORY_KIND.delete,
                    data: {
                        d: [
                            {
                                company_name: "Northstar Labs",
                                role_title: "Product Engineer",
                            },
                        ],
                        e: [{ id: "event-1" }],
                    },
                }),
            ),
        ).toEqual(["Applications: Northstar Labs (Product Engineer)"]);
    });

    it("uses set and cleared when one side is empty", () => {
        expect(
            historyChangesFor(
                historyAction({
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "NotionGraph",
                                f: {
                                    r: [null, "Developer"],
                                    l: ["Toronto", null],
                                },
                            },
                        ],
                    },
                }),
            ),
        ).toEqual([
            "NotionGraph: Role set to Developer",
            "NotionGraph: Location cleared",
        ]);
    });

    it("summarizes a bulk change instead of naming one application", () => {
        expect(
            historyChangesFor(
                historyAction({
                    kind: HISTORY_KIND.arrangement,
                    affectedCount: 18,
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "Orchard Finance",
                                f: { a: ["hybrid", null] },
                            },
                        ],
                    },
                }),
            ),
        ).toEqual(["Arrangement cleared for 18 applications"]);
    });

    it("keeps the application names behind each complete bulk summary", () => {
        expect(
            historyChangeDetailsFor(
                historyAction({
                    kind: HISTORY_KIND.arrangement,
                    affectedCount: 2,
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "Northstar Labs",
                                f: { a: ["remote", "hybrid"] },
                            },
                            {
                                i: "00000000-0000-4000-8000-000000000002",
                                n: "Juniper Systems",
                                f: { a: ["remote", "hybrid"] },
                            },
                        ],
                    },
                }),
            ),
        ).toEqual([
            {
                description:
                    "Arrangement changed from Remote to Hybrid for 2 applications",
                applications: ["Northstar Labs", "Juniper Systems"],
                applicationCount: 2,
            },
        ]);
    });

    it("describes the values applied by an undo", () => {
        expect(
            historyChangesFor(
                historyAction({
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "Cedar Grove",
                                f: {
                                    r: [
                                        "Software Engineer",
                                        "Staff Software Engineer",
                                    ],
                                },
                            },
                        ],
                    },
                }),
                0,
            ),
        ).toEqual([
            "Cedar Grove: Role changed from Staff Software Engineer to Software Engineer",
        ]);
    });

    it("does not claim a single destination for a mixed bulk change", () => {
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.status,
                    affectedCount: 2,
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "One",
                                f: { s: ["applied", "interviewing"] },
                            },
                            {
                                i: "00000000-0000-4000-8000-000000000002",
                                n: "Two",
                                f: { s: ["applied", "rejected"] },
                            },
                        ],
                    },
                }),
            ),
        ).toBe("Changed the status of 2 applications");
    });

    it("keeps useful import details when row snapshots are unavailable", () => {
        expect(
            historyChangesFor(
                historyAction({
                    kind: HISTORY_KIND.import,
                    affectedCount: 31,
                }),
            ),
        ).toEqual(["31 applications were added"]);
    });

    it("shows compact company and role details for imports", () => {
        expect(
            historyChangesFor(
                historyAction({
                    kind: HISTORY_KIND.import,
                    affectedCount: 2,
                    data: {
                        m: [
                            { n: "Acme", r: "Engineer" },
                            { n: "Northwind", r: null },
                        ],
                    },
                }),
            ),
        ).toEqual(["Applications: Acme (Engineer), Northwind"]);
    });

    it("describes a restore without exposing an internal timestamp", () => {
        const restore = historyAction({
            kind: HISTORY_KIND.restore,
            data: {
                n: "Imported 3 applications",
                t: "2026-08-22T15:04:29.000Z",
                v: {
                    a: [
                        {
                            i: "00000000-0000-4000-8000-000000000001",
                            n: "Acme",
                            f: { s: ["interviewing", "applied"] },
                        },
                    ],
                },
            },
        });

        expect(historyChangesFor(restore)).toEqual(["Updated 1 application"]);
        expect(historyChangeDetailsFor(restore)).toEqual([
            {
                description: "Updated 1 application",
                applications: ["Acme"],
                applicationCount: 1,
            },
        ]);
    });
});

const storedApplication = (
    overrides: Partial<StoredApplication> = {},
): StoredApplication => ({
    id: "00000000-0000-4000-8000-000000000001",
    position: 0,
    company_name: "NotionGraph",
    role_title: "Senior Engineer",
    status: "applied",
    url: null,
    location: null,
    arrangement: "remote",
    notes: null,
    pay_min: null,
    pay_max: null,
    pay_currency: "CAD",
    pay_period: null,
    bonus_amount: null,
    pay_note: null,
    applied_at: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by_history_action_id: null,
    ...overrides,
});

const versionState = (
    application: StoredApplication,
    description = "Current",
): VersionState => ({
    list: { name: "Applications", description, status: "active" },
    applications: new Map([[application.id, application]]),
    events: new Map(),
});

describe("point-in-time history restoration", () => {
    it("reconstructs the state after a selected action", () => {
        const application = storedApplication();
        const target = historyAction({ id: "10" });
        const laterEdit = historyAction({
            id: "11",
            data: {
                a: [
                    {
                        i: application.id,
                        n: application.company_name,
                        f: {
                            r: ["Engineer", "Senior Engineer"],
                            l: [null, "Toronto"],
                        },
                    },
                ],
            },
        });

        const restored = historyStateAt(
            versionState(
                storedApplication({
                    role_title: "Senior Engineer",
                    location: "Toronto",
                }),
            ),
            [target, laterEdit],
            target.id,
        );

        expect(restored?.applications.get(application.id)?.role_title).toBe(
            "Engineer",
        );
        expect(restored?.applications.get(application.id)?.location).toBeNull();
    });

    it("treats an undo row as a real point in the timeline", () => {
        const application = storedApplication({ role_title: "Engineer" });
        const edit = historyAction({
            id: "20",
            data: {
                a: [
                    {
                        i: application.id,
                        n: application.company_name,
                        f: { r: ["Engineer", "Senior Engineer"] },
                    },
                ],
            },
        });
        const undo = historyAction({
            id: "21",
            kind: HISTORY_KIND.undo,
            data: { o: edit.id, r: edit.id, q: 0, n: "Edited NotionGraph" },
        });

        const restored = historyStateAt(
            versionState(application),
            [edit, undo],
            edit.id,
        );

        expect(restored?.applications.get(application.id)?.role_title).toBe(
            "Senior Engineer",
        );
    });

    it("creates a reversible delta for a full-version restore", () => {
        const before = versionState(
            storedApplication({ role_title: "Senior Engineer" }),
            "Current",
        );
        const after = versionState(
            storedApplication({ role_title: "Engineer" }),
            "Earlier",
        );
        const delta = versionDeltaBetween(before, after);

        applyVersionDeltaToState(before, delta, 1);
        expect(before.list.description).toBe("Earlier");
        expect(before.applications.values().next().value?.role_title).toBe(
            "Engineer",
        );

        applyVersionDeltaToState(before, delta, 0);
        expect(before.list.description).toBe("Current");
        expect(before.applications.values().next().value?.role_title).toBe(
            "Senior Engineer",
        );
    });
});
