// A tiny Sankey layout engine. Callers describe a flow as nodes (assigned to
// columns) and links (source, target, value); this derives node heights and
// ribbon geometry so the flow can be drawn. It is deliberately data-driven:
// the landing hero and the dashboard both feed it different flows.

export type SankeyNodeSpec = {
    id: string;
    name: string;
    column: number;
    fill: string;
    labelSide: "start" | "end";
};

export type SankeyLinkSpec = {
    source: string;
    target: string;
    value: number;
    fill: string;
    opacity: number;
    shine: number;
};

export type SankeyNode = {
    name: string;
    count: number;
    x: number;
    y: number;
    h: number;
    fill: string;
    labelSide: "start" | "end";
};

export type SankeyLink = {
    x0: number;
    s0: number;
    s1: number;
    x1: number;
    t0: number;
    t1: number;
    fill: string;
    opacity: number;
    shine: number;
};

export type SankeyLayout = {
    // The viewBox the geometry is drawn into.
    width: number;
    height: number;
    // Left edge of each column, indexed by a node's `column`.
    columnsX: number[];
    nodeWidth: number;
    // Minimum vertical gap between stacked nodes in a column.
    gap?: number;
    // Fraction of the height the tallest column should fill; the rest is
    // margin and inter-node gaps. Heights scale to honor this.
    fill?: number;
};

// Turn a flow spec into positioned nodes and ribbons. Node heights come from
// their throughput; each column after the first is placed by the barycenter of
// its incoming ribbons (then de-overlapped) so ribbons stay level and rarely
// cross.
export const buildSankey = (
    nodes: SankeyNodeSpec[],
    links: SankeyLinkSpec[],
    layout: SankeyLayout,
): { nodes: SankeyNode[]; links: SankeyLink[] } => {
    const { height, columnsX, nodeWidth } = layout;
    const gap = layout.gap ?? 8;
    const fill = layout.fill ?? 0.75;

    const columnOf = new Map(nodes.map((node) => [node.id, node.column]));
    const orderOf = new Map(nodes.map((node, index) => [node.id, index]));

    const sumBy = (key: "source" | "target") => {
        const totals = new Map<string, number>();
        for (const link of links) {
            totals.set(link[key], (totals.get(link[key]) ?? 0) + link.value);
        }
        return totals;
    };
    const outValue = sumBy("source");
    const inValue = sumBy("target");

    const countOf = (id: string) =>
        Math.max(outValue.get(id) ?? 0, inValue.get(id) ?? 0);

    // Scale so the busiest column fills `fill` of the height. Every column
    // carries at most the total flow, so this keeps the drawing inside the box.
    const columnTotals = new Map<number, number>();
    for (const node of nodes) {
        columnTotals.set(
            node.column,
            (columnTotals.get(node.column) ?? 0) + countOf(node.id),
        );
    }
    const busiest = Math.max(0, ...columnTotals.values());
    const scale = busiest === 0 ? 0 : (height * fill) / busiest;
    const heightOf = (id: string) => countOf(id) * scale;

    // Departure order at a node, and the tie-break everywhere else: by the far
    // endpoint's column, then its position in the spec.
    const byRank = (a: string, b: string) =>
        (columnOf.get(a) ?? 0) - (columnOf.get(b) ?? 0) ||
        (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0);
    const outgoing = (id: string) =>
        links
            .filter((link) => link.source === id)
            .sort((a, b) => byRank(a.target, b.target));
    // Arriving ribbons stack in the vertical order they left their sources.
    // Ordering them any other way forces two of them to cross.
    const incoming = (id: string) =>
        links
            .filter((link) => link.target === id)
            .sort(
                (a, b) =>
                    sourceCenter(a) - sourceCenter(b) ||
                    byRank(a.source, b.source),
            );

    const top = new Map<string, number>();

    // Vertical center of a ribbon where it leaves its source node.
    const sourceCenter = (link: SankeyLinkSpec) => {
        let offset = top.get(link.source) ?? 0;
        for (const sibling of outgoing(link.source)) {
            if (sibling === link) break;
            offset += sibling.value * scale;
        }
        return offset + (link.value * scale) / 2;
    };

    const columns = [...new Set(nodes.map((node) => node.column))].sort(
        (a, b) => a - b,
    );

    for (const column of columns) {
        const ids = nodes
            .filter((node) => node.column === column)
            .map((node) => node.id);

        if (column === columns[0]) {
            const stack =
                ids.reduce((sum, id) => sum + heightOf(id), 0) +
                gap * (ids.length - 1);
            let cursor = (height - stack) / 2;
            for (const id of ids) {
                top.set(id, cursor);
                cursor += heightOf(id) + gap;
            }
            continue;
        }

        const desired = new Map<string, number>();
        for (const id of ids) {
            const ins = incoming(id);
            const weight = ins.reduce((sum, link) => sum + link.value, 0);
            desired.set(
                id,
                weight === 0
                    ? height / 2
                    : ins.reduce(
                          (sum, link) => sum + sourceCenter(link) * link.value,
                          0,
                      ) / weight,
            );
        }

        const ordered = [...ids].sort(
            (a, b) => (desired.get(a) ?? 0) - (desired.get(b) ?? 0),
        );
        let floor = 0;
        for (const id of ordered) {
            const y = Math.max(
                (desired.get(id) ?? 0) - heightOf(id) / 2,
                floor,
            );
            top.set(id, y);
            floor = y + heightOf(id) + gap;
        }
        // If the stack ran past the bottom, slide the whole column up.
        const last = ordered[ordered.length - 1];
        const overflow = (top.get(last) ?? 0) + heightOf(last) - height;
        if (overflow > 0) {
            for (const id of ordered) {
                top.set(id, (top.get(id) ?? 0) - overflow);
            }
        }
    }

    const sankeyNodes: SankeyNode[] = nodes.map((node) => ({
        name: node.name,
        count: countOf(node.id),
        x: columnsX[node.column],
        y: top.get(node.id) ?? 0,
        h: heightOf(node.id),
        fill: node.fill,
        labelSide: node.labelSide,
    }));

    // Walk each node's ribbon stacks to fix where every ribbon attaches.
    const endpoints = (
        key: "source" | "target",
        order: (id: string) => SankeyLinkSpec[],
    ) => {
        const starts = new Map<SankeyLinkSpec, number>();
        for (const node of nodes) {
            let offset = top.get(node.id) ?? 0;
            for (const link of order(node.id)) {
                if (link[key] === node.id) {
                    starts.set(link, offset);
                    offset += link.value * scale;
                }
            }
        }
        return starts;
    };
    const sourceStart = endpoints("source", outgoing);
    const targetStart = endpoints("target", incoming);

    const sankeyLinks: SankeyLink[] = links.map((link) => {
        const thickness = link.value * scale;
        const s0 = sourceStart.get(link) ?? 0;
        const t0 = targetStart.get(link) ?? 0;
        return {
            x0: columnsX[columnOf.get(link.source) ?? 0] + nodeWidth,
            s0,
            s1: s0 + thickness,
            x1: columnsX[columnOf.get(link.target) ?? 0],
            t0,
            t1: t0 + thickness,
            fill: link.fill,
            opacity: link.opacity,
            shine: link.shine,
        };
    });

    return { nodes: sankeyNodes, links: sankeyLinks };
};

// SVG path for a link ribbon: two cubic curves joined into a closed band.
export const sankeyRibbon = ({
    x0,
    s0,
    s1,
    x1,
    t0,
    t1,
}: SankeyLink): string => {
    const mx = (x0 + x1) / 2;
    return [
        `M${x0} ${s0}`,
        `C${mx} ${s0} ${mx} ${t0} ${x1} ${t0}`,
        `L${x1} ${t1}`,
        `C${mx} ${t1} ${mx} ${s1} ${x0} ${s1}`,
        "Z",
    ].join(" ");
};
