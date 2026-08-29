import { STATUS_META, type ActivityItem } from "@/components/dashboard/data";
import { LocalDateTime } from "@/components/dashboard/local-date-time";

export const ActivityFeed = ({ activity }: { activity: ActivityItem[] }) => (
    <section className="border border-hairline bg-background">
        <div className="flex h-10 items-center border-b border-hairline px-4">
            <h2 className="text-xs font-medium text-muted">Recent activity</h2>
        </div>
        {activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-sub">
                No activity yet.
            </p>
        ) : (
            <ul>
                {activity.map((event) => {
                    const meta = event.toStatus
                        ? STATUS_META[event.toStatus]
                        : null;
                    return (
                        <li
                            key={event.id}
                            className="flex items-start gap-3 border-b border-faint px-4 py-3 last:border-b-0"
                        >
                            <span
                                aria-hidden="true"
                                className={`mt-1.5 size-2 shrink-0 ${meta ? meta.tile : "bg-tile-border"}`}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink">
                                    <span className="font-medium">
                                        {event.company}
                                    </span>{" "}
                                    {meta ? (
                                        <>
                                            moved to{" "}
                                            <span className={meta.text}>
                                                {meta.label}
                                            </span>
                                        </>
                                    ) : (
                                        event.note
                                    )}
                                </p>
                                {meta && event.note && (
                                    <p className="mt-0.5 text-xs text-sub">
                                        {event.note}
                                    </p>
                                )}
                            </div>
                            <LocalDateTime
                                dateTime={event.occurredAt}
                                className="shrink-0 text-xs text-muted tabular-nums"
                            >
                                {event.when}
                            </LocalDateTime>
                        </li>
                    );
                })}
            </ul>
        )}
    </section>
);
