import { describe, expect, test } from "bun:test";
import { graphFrom } from "@/components/dashboard/pipeline-flow";
import type { ApplicationStatus, FlowEntry } from "@/components/dashboard/data";

const entry = (...history: ApplicationStatus[]): FlowEntry => ({
    status: history[history.length - 1],
    history,
});

const nameOf = (graph: ReturnType<typeof graphFrom>, id: string) =>
    graph.nodes.find((node) => node.id === id)?.name;

const reaches = (
    graph: ReturnType<typeof graphFrom>,
    from: string,
    to: string,
) => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length > 0) {
        const id = stack.pop() as string;
        if (id === to && id !== from) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const link of graph.links) {
            if (link.source === id) stack.push(link.target);
        }
    }
    return false;
};

// Two ribbons cross when the order of their two ends disagrees. Counting that
// over the order the nodes come back in measures how tangled the drawing is
// before the chart ever renders it.
const crossings = (graph: ReturnType<typeof graphFrom>, order: string[]) => {
    const at = new Map(order.map((id, index) => [id, index]));
    let total = 0;
    for (const [i, one] of graph.links.entries()) {
        for (const two of graph.links.slice(i + 1)) {
            const source =
                (at.get(one.source) ?? 0) - (at.get(two.source) ?? 0);
            const target =
                (at.get(one.target) ?? 0) - (at.get(two.target) ?? 0);
            if (source * target < 0) total += 1;
        }
    }
    return total;
};

// A busy season: several routes to the same stage, a couple of loops back, and
// journeys of very different lengths.
const SEASON: FlowEntry[] = [
    entry("not_applied", "applied"),
    entry("not_applied", "applied", "interviewing"),
    entry("not_applied", "applied", "interviewing", "rejected"),
    entry("not_applied", "applied", "online_assessment", "interviewing"),
    entry("not_applied", "applied", "interviewing", "online_assessment"),
    entry(
        "not_applied",
        "applied",
        "interviewing",
        "onsite",
        "offer_in_progress",
    ),
    entry(
        "not_applied",
        "applied",
        "online_assessment",
        "interviewing",
        "onsite",
        "rejected",
    ),
    entry("not_applied", "applied", "interviewing", "not_applied", "applied"),
    entry("not_applied", "applied", "takehome", "interviewing", "ghosted"),
];

describe("graphFrom", () => {
    test("counts every application in the opening column", () => {
        const graph = graphFrom([
            entry("not_applied", "applied"),
            entry("not_applied", "applied", "interviewing"),
            entry("not_applied", "applied", "interviewing", "rejected"),
        ]);
        const leaving = graph.links
            .filter((link) => link.source === "applied-1")
            .reduce((total, link) => total + link.value, 0);
        expect(leaving).toBe(3);
    });

    test("an application that stopped keeps a ribbon of its own", () => {
        // Two interview, one moves on and one stays. The one that stayed used
        // to vanish into the shared bar.
        const graph = graphFrom([
            entry("not_applied", "applied", "interviewing"),
            entry("not_applied", "applied", "interviewing", "rejected"),
        ]);
        const resting = graph.links.find(
            (link) =>
                link.source === "interviewing-1" &&
                link.target === "rest-interviewing",
        );
        expect(resting?.value).toBe(1);
        expect(nameOf(graph, "rest-interviewing")).toBe("Interviewing");
        expect(nameOf(graph, "interviewing-1")).toBe("Interview");
    });

    test("journeys still at applied share one resting node", () => {
        // Different lengths, so these used to land on separate nodes a column
        // apart rather than merging.
        const graph = graphFrom([
            entry("not_applied", "applied"),
            entry("not_applied", "applied", "interviewing", "applied"),
        ]);
        const waiting = graph.nodes.filter(
            (node) => node.name === "Awaiting reply",
        );
        expect(waiting).toHaveLength(1);
        expect(waiting[0].id).toBe("rest-applied");
    });

    test("the same round reached by different routes is one node", () => {
        // Circleback went straight to an OA, Tally interviewed first. Both are
        // a first OA, so they belong on the same node despite sitting at
        // different points in their journeys.
        const graph = graphFrom([
            entry("not_applied", "applied", "online_assessment", "rejected"),
            entry(
                "not_applied",
                "applied",
                "interviewing",
                "online_assessment",
                "rejected",
            ),
        ]);
        expect(graph.nodes.filter((node) => node.name === "OA")).toHaveLength(
            1,
        );
        const into = graph.links
            .filter((link) => link.target === "online_assessment-1")
            .reduce((total, link) => total + link.value, 0);
        expect(into).toBe(2);
    });

    test("breaking a loop splits one status, not every status in it", () => {
        // Interview -> Offer -> OA and OA -> Interview close a loop. Telling
        // any one of the three apart is enough, so the other two stay merged
        // rather than all of them being pulled apart by position.
        const graph = graphFrom([
            entry(
                "not_applied",
                "applied",
                "interviewing",
                "offer_in_progress",
                "online_assessment",
                "rejected",
            ),
            entry(
                "not_applied",
                "applied",
                "online_assessment",
                "interviewing",
                "rejected",
            ),
        ]);
        const repeated = ["OA", "Offer", "Interview"].filter(
            (label) =>
                graph.nodes.filter((node) => node.name === label).length > 1,
        );
        expect(repeated).toHaveLength(1);
        // Both OAs are a first OA reached by different routes, so they share.
        expect(graph.nodes.filter((node) => node.name === "OA")).toHaveLength(
            1,
        );
    });

    test("statuses that loop are pinned apart and stay acyclic", () => {
        // Interview -> Offer -> OA from one application and OA -> Interview
        // from another close a loop, which no column order can satisfy.
        const graph = graphFrom([
            entry(
                "not_applied",
                "applied",
                "interviewing",
                "offer_in_progress",
                "online_assessment",
                "rejected",
            ),
            entry(
                "not_applied",
                "applied",
                "online_assessment",
                "interviewing",
                "rejected",
            ),
        ]);
        for (const node of graph.nodes) {
            expect(reaches(graph, node.id, node.id)).toBe(false);
        }
    });

    test("the drawing does not depend on the order applications arrive", () => {
        const journeys = [
            entry(
                "not_applied",
                "applied",
                "interviewing",
                "offer_in_progress",
                "online_assessment",
                "rejected",
            ),
            entry(
                "not_applied",
                "applied",
                "online_assessment",
                "interviewing",
                "rejected",
            ),
            entry("not_applied", "applied"),
        ];
        const ids = (flow: FlowEntry[]) =>
            graphFrom(flow)
                .nodes.map((node) => node.id)
                .sort();
        expect(ids([...journeys].reverse())).toEqual(ids(journeys));
    });

    test("nodes come back in an order that keeps ribbons untangled", () => {
        const graph = graphFrom(SEASON);
        const swept = graph.nodes.map((node) => node.id);
        // The order the journeys happen to build the nodes in, which is what
        // the sweep replaces. It cuts this roughly in half, so anything near
        // it means the sweep has stopped doing its job.
        const raw = [
            ...new Set(graph.links.flatMap((l) => [l.source, l.target])),
        ];
        expect(crossings(graph, swept)).toBeLessThan(crossings(graph, raw) / 2);
    });

    test("no ribbon skips over a column", () => {
        // A ribbon spanning more than one column has nothing keeping it clear
        // of the nodes underneath, so every one should be threaded through an
        // invisible node in each column it crosses.
        const graph = graphFrom(SEASON);
        const depth = new Map<string, number>();
        const settle = () => {
            let moved = false;
            for (const link of graph.links) {
                const next = (depth.get(link.source) ?? 0) + 1;
                if (next > (depth.get(link.target) ?? 0)) {
                    depth.set(link.target, next);
                    moved = true;
                }
            }
            return moved;
        };
        while (settle());

        for (const link of graph.links) {
            const span =
                (depth.get(link.target) ?? 0) - (depth.get(link.source) ?? 0);
            expect(span).toBe(1);
        }
        expect(graph.nodes.some((node) => node.via)).toBe(true);
    });

    test("a threaded ribbon still names the move it really is", () => {
        const graph = graphFrom(SEASON);
        const named = new Map(graph.nodes.map((node) => [node.id, node.name]));
        for (const link of graph.links) {
            expect(named.get(link.from)).toBeTruthy();
            expect(named.get(link.to)).toBeTruthy();
        }
    });

    test("an application that never applied is left out", () => {
        const graph = graphFrom([entry("not_applied")]);
        expect(graph.links).toHaveLength(0);
    });

    test("nothing is lost between the opening and closing columns", () => {
        const flow = [
            entry("not_applied", "applied"),
            entry("not_applied", "applied", "interviewing"),
            entry("not_applied", "applied", "interviewing", "applied"),
            entry(
                "not_applied",
                "applied",
                "online_assessment",
                "interviewing",
                "offer_in_progress",
            ),
        ];
        const graph = graphFrom(flow);
        const ending = new Set(graph.nodes.map((node) => node.id));
        for (const link of graph.links) ending.delete(link.source);
        const arrived = graph.links
            .filter((link) => ending.has(link.target))
            .reduce((total, link) => total + link.value, 0);
        expect(arrived).toBe(flow.length);
    });

    test("a status nothing carries on from is the ending itself", () => {
        // Every one of these stops where it lands, so each status is already
        // an ending and needs no separate resting node hanging off it.
        const graph = graphFrom([
            entry("not_applied", "applied", "ghosted"),
            entry("not_applied", "applied", "rejected"),
            entry("not_applied", "applied", "other"),
            entry("not_applied", "applied", "offer_in_progress"),
            entry("not_applied", "applied"),
        ]);
        expect(graph.nodes.map((node) => node.name).sort()).toEqual([
            "Applied",
            "Awaiting reply",
            "Ghosted",
            "Offer in progress",
            "Other",
            "Rejected",
        ]);
        // One move each, straight from applied to where it ended.
        expect(graph.links).toHaveLength(5);
    });

    test("a status others carried on from keeps its resting node", () => {
        // One interview stops and one moves on, so "Interview" cannot be the
        // ending and the one that stayed still needs somewhere to land.
        const graph = graphFrom([
            entry("not_applied", "applied", "interviewing"),
            entry("not_applied", "applied", "interviewing", "rejected"),
        ]);
        const names = graph.nodes.map((node) => node.name);
        expect(names).toContain("Interview");
        expect(names).toContain("Interviewing");
    });
});
