export const InsightsPlaceholder = ({ error }: { error?: string | null }) => (
    <div
        aria-live="polite"
        className="grid min-h-40 place-items-center border border-hairline bg-background px-6 py-10 text-center"
    >
        <div>
            <span
                aria-hidden="true"
                className={`${error ? "icon-[lucide--triangle-alert] text-rose" : "icon-[lucide--loader-circle] animate-spin text-muted"} mx-auto block size-5`}
            />
            <p className="mt-3 text-sm text-sub">
                {error ?? "Loading insights..."}
            </p>
        </div>
    </div>
);
