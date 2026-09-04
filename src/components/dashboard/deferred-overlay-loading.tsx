const LoadingStatus = ({ label }: { label: string }) => (
    <div
        role="status"
        aria-live="polite"
        className="grid min-h-0 flex-1 place-items-center px-6 py-12 text-center"
    >
        <div>
            <span
                aria-hidden="true"
                className="icon-[lucide--loader-circle] mx-auto block size-5 animate-spin text-muted"
            />
            <p className="mt-3 text-sm text-sub">{label}</p>
        </div>
    </div>
);

export const DeferredDrawerLoading = ({
    title,
    subtitle,
    label,
}: {
    title: string;
    subtitle?: string;
    label: string;
}) => (
    <div className="fixed inset-0 z-[60] bg-ink/25">
        <div className="ml-auto flex h-dvh w-120 max-w-full flex-col border-l border-hairline bg-background shadow-lg">
            <header className="shrink-0 border-b border-hairline px-5 py-4">
                <h2 className="truncate text-sm font-medium text-ink">
                    {title}
                </h2>
                <p className="mt-0.5 h-4 truncate text-xs text-sub">
                    {subtitle}
                </p>
            </header>
            <LoadingStatus label={label} />
        </div>
    </div>
);

export const DeferredDialogLoading = ({
    title,
    label,
    tall = false,
}: {
    title: string;
    label: string;
    tall?: boolean;
}) => (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/25 p-4 sm:p-6">
        <div
            className={`${tall ? "h-[min(45rem,calc(100dvh-2rem))] sm:h-[min(45rem,calc(100dvh-3rem))]" : "h-80 max-h-[85dvh]"} flex w-full max-w-3xl flex-col border border-hairline bg-background shadow-lg`}
        >
            <header className="flex h-14 shrink-0 items-center border-b border-hairline px-5 sm:px-6">
                <h2 className="text-base font-semibold text-balance text-ink">
                    {title}
                </h2>
            </header>
            <LoadingStatus label={label} />
        </div>
    </div>
);
