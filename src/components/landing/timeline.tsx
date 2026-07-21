const EVENTS = [
    {
        anim: "tl-1",
        date: "May 20",
        title: <>Link pasted, row created</>,
        detail: "Company, role, and salary filled from the posting",
        fromInbox: false,
    },
    {
        anim: "tl-2",
        date: "May 20",
        title: <>Application confirmed</>,
        detail: "Receipt matched in your inbox",
        fromInbox: true,
    },
    {
        anim: "tl-3",
        date: "May 28",
        title: (
            <>
                Stage moved to{" "}
                <span className="text-accent-deep">Interview</span>
            </>
        ),
        detail: "Recruiter reply detected",
        fromInbox: true,
    },
    {
        anim: "tl-4",
        date: "Jun 09",
        title: <>Onsite confirmed for Jun 12</>,
        detail: "Schedule pulled from the thread",
        fromInbox: true,
    },
    {
        anim: "tl-5",
        date: "Jun 20",
        title: (
            <>
                Stage moved to <span className="text-gold">Offer</span>
            </>
        ),
        detail: "Offer letter detected, salary updated to $195k",
        fromInbox: true,
    },
];

export const Timeline = () => (
    <div aria-hidden="true" className="relative">
        <div className="tl tl-line absolute top-1 bottom-1 left-20 w-px bg-hairline" />
        <div className="flex flex-col gap-9">
            {EVENTS.map((event) => (
                <div
                    key={event.anim}
                    className={`tl ${event.anim} grid grid-cols-[3.5rem_3rem_minmax(0,1fr)] items-start`}
                >
                    <span className="pt-0.5 text-xs text-muted">
                        {event.date}
                    </span>
                    <span className="flex justify-center pt-1.5">
                        <span className="size-2 border border-muted bg-background" />
                    </span>
                    <span>
                        <span className="block text-sm font-medium text-ink">
                            {event.title}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-sub">
                            {event.fromInbox && (
                                <span className="icon-[simple-icons--gmail] size-2.5 shrink-0 text-muted" />
                            )}
                            {event.detail}
                        </span>
                    </span>
                </div>
            ))}
        </div>
    </div>
);
