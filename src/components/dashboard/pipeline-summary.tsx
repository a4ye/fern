import { STATUS_META, type PipelineEntry } from "@/components/dashboard/data";

export const PipelineSummary = ({
    pipeline,
}: {
    pipeline: PipelineEntry[];
}) => {
    const total = pipeline.reduce((sum, entry) => sum + entry.count, 0);

    return (
        <section className="border border-hairline bg-background">
            <div className="flex h-10 items-center justify-between border-b border-hairline px-4">
                <h2 className="text-xs font-medium text-muted">By status</h2>
                <span className="text-xs text-sub tabular-nums">
                    {total} total
                </span>
            </div>
            {pipeline.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-sub">
                    Nothing to count yet.
                </p>
            ) : (
                <ul>
                    {pipeline.map((entry) => {
                        const meta = STATUS_META[entry.status];
                        return (
                            <li
                                key={entry.status}
                                className="flex items-center gap-3 border-b border-faint px-4 py-2.5 last:border-b-0"
                            >
                                <span
                                    className={`size-2.5 shrink-0 ${meta.tile}`}
                                />
                                <span className="flex-1 text-sm text-ink">
                                    {meta.label}
                                </span>
                                <span className="text-sm font-medium text-ink tabular-nums">
                                    {entry.count}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};
