import {
    DIALOG_TITLE_ID,
    DRAWER_TITLE_ID,
} from "@/components/dashboard/overlay-shell";

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
    <>
        <header className="shrink-0 border-b border-hairline px-5 py-4">
            <h2
                id={DRAWER_TITLE_ID}
                className="truncate text-sm font-medium text-ink"
            >
                {title}
            </h2>
            <p className="mt-0.5 h-4 truncate text-xs text-sub">{subtitle}</p>
        </header>
        <LoadingStatus label={label} />
    </>
);

export const DeferredDialogLoading = ({
    title,
    label,
}: {
    title: string;
    label: string;
}) => (
    <>
        <header className="flex h-14 shrink-0 items-center border-b border-hairline px-5 sm:px-6">
            <h2
                id={DIALOG_TITLE_ID}
                className="text-base font-semibold text-balance text-ink"
            >
                {title}
            </h2>
        </header>
        <LoadingStatus label={label} />
    </>
);
