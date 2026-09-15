import { stopViewAs } from "@/app/dashboard/admin/actions";

// Sits inside the header so the reminder cannot be scrolled away: everything
// below it belongs to somebody else, and the gold edge is there to be noticed
// before anything on the page is read as your own.
export const ViewAsBar = ({ name, email }: { name: string; email: string }) => (
    <>
        <div className="h-0.75 bg-gold" />
        <div className="border-t border-hairline bg-surface">
            <div className="mx-auto flex h-10 w-full max-w-7xl items-center justify-between gap-4 px-6 sm:px-10">
                <p className="truncate text-xs text-sub">
                    Viewing <span className="font-medium text-ink">{name}</span>
                    {`, ${email}. Read only.`}
                </p>
                <form action={stopViewAs}>
                    <button
                        type="submit"
                        className="focus-frame flex h-7 cursor-pointer items-center border border-hairline bg-background px-3 text-xs font-medium text-sub transition-colors hover:bg-surface hover:text-ink"
                    >
                        Stop
                    </button>
                </form>
            </div>
        </div>
    </>
);
