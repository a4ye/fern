// Placeholder for the inbox sync trigger, which is loaded on demand and also
// absent from the first paint of the lists page. It paints the real button's
// box and takes its width from the same label, so the toolbar cannot change
// length when the button arrives. The count badge is left out because it sits
// outside the flow and so costs no width.
export const EmailSyncSkeleton = () => (
    <span
        role="status"
        aria-label="Loading inbox sync"
        className="skeleton inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 border border-transparent text-sm whitespace-nowrap sm:w-auto sm:px-3"
    >
        <span className="size-4 shrink-0" />
        <span className="invisible hidden sm:inline">Inbox sync</span>
    </span>
);
