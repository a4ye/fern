import { Toaster } from "sonner";

// Shared by the dashboard and by the page a shared list is read on, so a
// message reads the same wherever it is raised.
export const AppToaster = () => (
    <Toaster
        position="bottom-right"
        // The type reads from the top edge, the same sage/rose marker the
        // dialogs carry, so the filled default icons can go.
        icons={{ success: null, error: null }}
        toastOptions={{
            unstyled: true,
            classNames: {
                toast: "relative flex w-full items-center gap-3 border-x border-b border-hairline bg-background px-4 py-3 font-sans shadow-sm",
                content: "min-w-0 flex-1",
                title: "text-pretty text-xs font-medium text-ink",
                description: "mt-1 text-xs text-sub",
                actionButton:
                    "focus-frame inline-flex h-10 shrink-0 cursor-pointer items-center border border-hairline bg-background px-3 text-xs font-medium text-ink transition-colors hover:border-tile-border",
                success: "border-t-[3px] border-t-accent",
                info: "border-t-[3px] border-t-accent",
                warning: "border-t-[3px] border-t-gold",
                error: "border-t-[3px] border-t-rose",
            },
        }}
    />
);
