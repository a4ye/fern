import { describe, expect, it } from "bun:test";
import {
    decodeHistoryActions,
    encodeHistoryActions,
    HISTORY_KIND,
    historyActionRunsMaintenance,
    historyApplicationsPageFor,
    historyChangeDetailsFor,
    historyChangesPageFor,
    historyChangesFor,
    historyReversalFor,
    historyStateAt,
    historyTitleFor,
    historyTitleValueFor,
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
        ).toBe("Updated NotionGraph");
    });

    it("does not add again to a reapplied bulk change", () => {
        const original = historyAction({
            kind: HISTORY_KIND.status,
            affectedCount: 1146,
            data: {
                a: [
                    {
                        i: "00000000-0000-4000-8000-000000000001",
                        n: "Application",
                        f: { s: ["not_applied", "applied"] },
                    },
                ],
            },
        });
        const redo = historyAction({
            kind: HISTORY_KIND.undo,
            affectedCount: 1146,
            data: {
                n: "Moved 1,146 applications to Applied",
                q: 1,
            },
        });
        expect(historyTitleFor(redo)).toBe(
            "Moved 1,146 applications to Applied",
        );
        expect(historyTitleValueFor(redo, original)).toEqual({
            field: "status",
            value: "applied",
        });
    });

    it("describes reversing and reapplying a list restore plainly", () => {
        const original = "Restored an earlier version of the list";
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.undo,
                    data: { n: original },
                }),
            ),
        ).toBe("Restored the previous version of the list");
        expect(
            historyTitleFor(
                historyAction({
                    kind: HISTORY_KIND.undo,
                    data: { n: original, q: 1 },
                }),
            ),
        ).toBe("Restored the earlier version of the list");
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
                kind: "value",
                description:
                    "Arrangement changed from Remote to Hybrid for 2 applications",
                applications: ["Northstar Labs", "Juniper Systems"],
                applicationCount: 2,
                valueChange: {
                    field: "arrangement",
                    subject: null,
                    before: "remote",
                    after: "hybrid",
                    count: 2,
                },
            },
        ]);
    });

    it("pages every application in a large bulk change", () => {
        const bulkEdit = historyAction({
            kind: HISTORY_KIND.status,
            affectedCount: 25,
            data: {
                a: Array.from({ length: 25 }, (_, index) => ({
                    i: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
                    n: `Application ${index + 1}`,
                    f: { s: ["applied", "interviewing"] },
                })),
            },
        });

        expect(historyApplicationsPageFor(bulkEdit, 1, 0, 1)).toEqual({
            applications: Array.from(
                { length: 10 },
                (_, index) => `Application ${index + 11}`,
            ),
            page: 1,
            pageCount: 3,
            total: 25,
        });
        expect(historyApplicationsPageFor(bulkEdit, 1, 0, 2)).toEqual({
            applications: [
                "Application 21",
                "Application 22",
                "Application 23",
                "Application 24",
                "Application 25",
            ],
            page: 2,
            pageCount: 3,
            total: 25,
        });
    });

    it("keeps named applications together before sorted bulk changes", () => {
        const details = historyChangeDetailsFor(
            historyAction({
                affectedCount: 9,
                data: {
                    a: [
                        {
                            i: "00000000-0000-4000-8000-000000000001",
                            n: "Beta Health",
                            f: { s: ["interviewing", "applied"] },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000002",
                            n: "Alpha Labs",
                            f: {
                                r: ["Engineer", "Senior Engineer"],
                                l: ["Toronto", "Remote"],
                            },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000003",
                            n: "Gamma Systems",
                            f: { s: ["not_applied", "applied"] },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000004",
                            n: "Delta Systems",
                            f: { s: ["not_applied", "applied"] },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000005",
                            n: "Epsilon Systems",
                            f: { s: ["rejected", "applied"] },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000006",
                            n: "Zeta Systems",
                            f: { s: ["rejected", "applied"] },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000007",
                            n: "Eta Systems",
                            f: { d: [null, "2026-08-24"] },
                        },
                        {
                            i: "00000000-0000-4000-8000-000000000008",
                            n: "Theta Systems",
                            f: { d: [null, "2026-08-24"] },
                        },
                    ],
                },
            }),
        );

        expect(
            details.map((change) => ({
                subject:
                    change.valueChange?.subject ??
                    change.fieldChange?.subject ??
                    null,
                field:
                    change.valueChange?.field ?? change.fieldChange?.code,
                before:
                    change.valueChange?.before ?? change.fieldChange?.before,
            })),
        ).toEqual([
            {
                subject: "Alpha Labs",
                field: "r",
                before: "Engineer",
            },
            {
                subject: "Alpha Labs",
                field: "l",
                before: "Toronto",
            },
            {
                subject: "Beta Health",
                field: "status",
                before: "interviewing",
            },
            { subject: null, field: "status", before: "not_applied" },
            { subject: null, field: "status", before: "rejected" },
            { subject: null, field: "d", before: null },
        ]);
    });

    it("keeps every change available beyond the initial page", () => {
        const action = historyAction({
            affectedCount: 30,
            data: {
                a: Array.from({ length: 30 }, (_, index) => ({
                    i: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
                    n: `Application ${index + 1}`,
                    f: {
                        r: [
                            `Engineer ${index + 1}`,
                            `Senior Engineer ${index + 1}`,
                        ],
                    },
                })),
            },
        });

        expect(historyChangeDetailsFor(action)).toHaveLength(30);
        expect(historyChangesPageFor(action, 1, 24)).toMatchObject({
            offset: 24,
            total: 30,
        });
        expect(historyChangesPageFor(action, 1, 24).changes).toHaveLength(6);
    });

    it("keeps status values structured for history chips", () => {
        expect(
            historyChangeDetailsFor(
                historyAction({
                    kind: HISTORY_KIND.status,
                    affectedCount: 2,
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "Northstar Labs",
                                f: { s: ["applied", "interviewing"] },
                            },
                            {
                                i: "00000000-0000-4000-8000-000000000002",
                                n: "Juniper Systems",
                                f: { s: ["applied", "interviewing"] },
                            },
                        ],
                    },
                }),
            )[0]?.valueChange,
        ).toEqual({
            field: "status",
            subject: null,
            before: "applied",
            after: "interviewing",
            count: 2,
        });
    });

    it("keeps currency context with pay changes", () => {
        const details = historyChangeDetailsFor(
            historyAction({
                data: {
                    a: [
                        {
                            i: "00000000-0000-4000-8000-000000000001",
                            n: "Kite Labs",
                            p: ["CAD", "CAD"],
                            f: {
                                mi: [null, "125000.00"],
                                ma: [null, "165000.00"],
                                pe: [null, "yearly"],
                            },
                        },
                    ],
                },
            }),
        );

        expect(details.map((detail) => detail.fieldChange)).toEqual([
            {
                scope: "application",
                code: "mi",
                label: "Minimum pay",
                subject: "Kite Labs",
                before: null,
                after: "125000.00",
                count: 1,
                currencyBefore: "CAD",
                currencyAfter: "CAD",
            },
            {
                scope: "application",
                code: "ma",
                label: "Maximum pay",
                subject: "Kite Labs",
                before: null,
                after: "165000.00",
                count: 1,
                currencyBefore: "CAD",
                currencyAfter: "CAD",
            },
            {
                scope: "application",
                code: "pe",
                label: "Pay period",
                subject: "Kite Labs",
                before: null,
                after: "yearly",
                count: 1,
            },
        ]);
        expect(details[2]?.description).toBe(
            "Kite Labs: Pay period set to Yearly",
        );
    });

    it("uses the app's Link label for URL changes", () => {
        expect(
            historyChangeDetailsFor(
                historyAction({
                    data: {
                        a: [
                            {
                                i: "00000000-0000-4000-8000-000000000001",
                                n: "Halcyon Health",
                                f: {
                                    u: [
                                        null,
                                        "https://example.com/application",
                                    ],
                                },
                            },
                        ],
                    },
                }),
            )[0]?.fieldChange?.label,
        ).toBe("Link");
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

    it("uses the same role and company format for imports", () => {
        const imported = historyAction({
            kind: HISTORY_KIND.import,
            affectedCount: 2,
            data: {
                m: [
                    { n: "Acme", r: "Engineer" },
                    { n: "Northwind", r: null },
                ],
            },
        });

        expect(historyChangesFor(imported)).toEqual([
            "Applications: Engineer at Acme, Northwind",
        ]);
        expect(historyChangeDetailsFor(imported)).toEqual([
            {
                kind: "applications",
                description: "Applications: Engineer at Acme, Northwind",
                applications: ["Engineer at Acme", "Northwind"],
                applicationCount: 2,
                applicationListLabel: "Added applications",
            },
        ]);
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

        expect(historyChangesFor(restore)).toEqual([
            "Acme: Status changed from Interviewing to Applied",
        ]);
        expect(historyTitleFor(restore)).toBe(
            "Restored an earlier version of the list",
        );
        expect(historyChangeDetailsFor(restore)).toEqual([
            {
                kind: "value",
                description:
                    "Acme: Status changed from Interviewing to Applied",
                applications: [],
                applicationCount: 0,
                valueChange: {
                    field: "status",
                    subject: "Acme",
                    before: "interviewing",
                    after: "applied",
                    count: 1,
                },
            },
        ]);
    });

    it("keeps every application field on a structured rendering path", () => {
        const details = historyChangeDetailsFor(
            historyAction({
                data: {
                    a: [
                        {
                            i: "00000000-0000-4000-8000-000000000001",
                            n: "Acme",
                            f: {
                                c: ["Acme", "Acme Labs"],
                                r: ["Engineer", "Senior Engineer"],
                                s: ["applied", "interviewing"],
                                u: [null, "https://example.com/job"],
                                l: [null, "Toronto, ON"],
                                a: ["remote", "hybrid"],
                                n: [null, "Interview notes"],
                                mi: [null, "120000.00"],
                                ma: [null, "160000.00"],
                                cu: ["USD", "CAD"],
                                pe: [null, "yearly"],
                                b: [null, "10000.00"],
                                pn: [null, "Bonus and equity"],
                                d: [null, "2026-08-24"],
                            },
                        },
                    ],
                },
            }),
        );

        expect(details).toHaveLength(14);
        expect(details.map((detail) => detail.kind)).toEqual([
            "field",
            "field",
            "value",
            "field",
            "field",
            "value",
            "field",
            "field",
            "field",
            "field",
            "field",
            "field",
            "field",
            "field",
        ]);
        expect(
            details
                .filter((detail) => detail.fieldChange)
                .map((detail) => [
                    detail.fieldChange?.scope,
                    detail.fieldChange?.code,
                ]),
        ).toEqual([
            ["application", "c"],
            ["application", "r"],
            ["application", "u"],
            ["application", "l"],
            ["application", "n"],
            ["application", "mi"],
            ["application", "ma"],
            ["application", "cu"],
            ["application", "pe"],
            ["application", "b"],
            ["application", "pn"],
            ["application", "d"],
        ]);
        expect(
            details
                .filter((detail) => detail.valueChange)
                .map((detail) => detail.valueChange?.field),
        ).toEqual(["status", "arrangement"]);
    });

    it("renders list fields with the same structured field data", () => {
        const details = historyChangeDetailsFor(
            historyAction({
                kind: HISTORY_KIND.list,
                data: {
                    f: {
                        n: ["Old list", "New list"],
                        d: ["Old description", "New description"],
                        s: ["active", "closed"],
                    },
                },
            }),
        );

        expect(
            details.map((detail) => ({
                scope: detail.fieldChange?.scope,
                code: detail.fieldChange?.code,
                label: detail.fieldChange?.label,
            })),
        ).toEqual([
            { scope: "list", code: "n", label: "Name" },
            { scope: "list", code: "d", label: "Description" },
            { scope: "list", code: "s", label: "Status" },
        ]);
    });

    it("shows what was added to and removed from status history", () => {
        const event = {
            id: "00000000-0000-4000-8000-000000000010",
            application_id: "00000000-0000-4000-8000-000000000001",
            from_status: "applied",
            to_status: "interviewing",
            note: "Technical interview",
            occurred_at: "2026-08-24T12:00:00.000Z",
            history_action_id: "20",
        };
        const details = historyChangeDetailsFor(
            historyAction({
                kind: HISTORY_KIND.steps,
                data: { n: "Acme", g: [event], e: [event] },
            }),
        );

        expect(details.map((detail) => detail.statusEntryChange)).toEqual([
            {
                action: "removed",
                subject: "Acme",
                from: "applied",
                to: "interviewing",
                note: "Technical interview",
            },
            {
                action: "added",
                subject: "Acme",
                from: "applied",
                to: "interviewing",
                note: "Technical interview",
            },
        ]);
        expect(details.map((detail) => detail.kind)).toEqual([
            "statusEntry",
            "statusEntry",
        ]);
    });

    it("keeps restore list fields and added or removed applications separate", () => {
        const created = storedApplication({
            id: "00000000-0000-4000-8000-000000000002",
            company_name: "Juniper",
        });
        const removed = storedApplication({
            id: "00000000-0000-4000-8000-000000000003",
            company_name: "Cedar",
        });
        const details = historyChangeDetailsFor(
            historyAction({
                kind: HISTORY_KIND.restore,
                data: {
                    v: {
                        c: [created],
                        d: [removed],
                        f: {
                            d: ["Current description", null],
                            s: ["active", "closed"],
                        },
                    },
                },
            }),
        );

        expect(details.map((detail) => detail.applicationListLabel)).toEqual([
            "Added application",
            "Removed application",
            undefined,
            undefined,
        ]);
        expect(
            details.slice(2).map((detail) => detail.fieldChange?.scope),
        ).toEqual(["list", "list"]);
    });

    it("keeps the status changes for each application in a restore", () => {
        const cedarId = "00000000-0000-4000-8000-000000000011";
        const driftwoodId = "00000000-0000-4000-8000-000000000012";
        const event = (
            id: string,
            applicationId: string,
            from: string,
            to: string,
            note: string | null,
        ) => ({
            id,
            application_id: applicationId,
            from_status: from,
            to_status: to,
            note,
            occurred_at: "2026-08-24T12:00:00.000Z",
            history_action_id: "20",
        });
        const restore = historyAction({
            kind: HISTORY_KIND.restore,
            data: {
                m: [
                    { i: cedarId, n: "Cedar Systems", r: "Product Engineer" },
                    {
                        i: driftwoodId,
                        n: "Driftwood Systems",
                        r: "Platform Engineer",
                    },
                ],
                v: {
                    e: {
                        c: [
                            event(
                                "00000000-0000-4000-8000-000000000021",
                                cedarId,
                                "applied",
                                "interviewing",
                                "Technical interview",
                            ),
                        ],
                        d: [
                            event(
                                "00000000-0000-4000-8000-000000000022",
                                driftwoodId,
                                "interviewing",
                                "onsite",
                                null,
                            ),
                        ],
                    },
                },
            },
        });

        expect(historyChangeDetailsFor(restore)[0]?.applicationDetails).toEqual(
            [
                {
                    application: "Product Engineer at Cedar Systems",
                    statusEntries: [
                        {
                            action: "added",
                            from: "applied",
                            to: "interviewing",
                            note: "Technical interview",
                        },
                    ],
                },
                {
                    application: "Platform Engineer at Driftwood Systems",
                    statusEntries: [
                        {
                            action: "removed",
                            from: "interviewing",
                            to: "onsite",
                            note: null,
                        },
                    ],
                },
            ],
        );
        expect(historyChangeDetailsFor(restore)[0]?.kind).toBe("summary");
        expect(
            historyChangeDetailsFor(restore, 0)[0]?.applicationDetails?.map(
                (detail) => detail.statusEntries[0]?.action,
            ),
        ).toEqual(["removed", "restored"]);
        expect(
            historyApplicationsPageFor(restore, 1, 0, 0)
                ?.applicationDetails?.[0]?.statusEntries[0]?.note,
        ).toBe("Technical interview");
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

    it("keeps pay currency in a version delta without duplicating a field edit", () => {
        const before = versionState(
            storedApplication({ pay_min: null, pay_currency: "CAD" }),
        );
        const after = versionState(
            storedApplication({ pay_min: "125000.00", pay_currency: "CAD" }),
        );

        expect(versionDeltaBetween(before, after).a?.[0]).toMatchObject({
            f: { mi: [null, "125000.00"] },
            p: ["CAD", "CAD"],
        });
    });
});
