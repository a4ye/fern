import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";

export const DRAWER_TITLE_ID = "application-drawer-title";
export const DIALOG_TITLE_ID = "dashboard-dialog-title";

type OverlayHandle = {
    dismiss: () => void;
    setTeardown: (teardown: () => void) => void;
};

const OverlayContext = createContext<OverlayHandle>({
    dismiss: () => {},
    setTeardown: () => {},
});

export const useOverlayDismiss = () => useContext(OverlayContext).dismiss;

// The shell is open before the body it holds has loaded, so it cannot know what
// that body needs to undo on the way out. The body leaves that here, and Escape
// and the backdrop then close it the way its own Cancel button does.
export const useOverlayTeardown = (teardown: () => void) => {
    const { setTeardown } = useContext(OverlayContext);
    useEffect(() => {
        setTeardown(teardown);
    });
};

// Each overlay body arrives in its own chunk, so the dialog is opened from here,
// above that boundary, and the spinner waits inside it. A stand-in panel of its
// own would put two elements through the opening: the first appears with no
// animation at all, and the real one then plays the entrance over the top of it.
const OverlayShell = ({
    className,
    labelledBy,
    onClose,
    children,
}: {
    className: string;
    labelledBy: string;
    onClose: () => void;
    children: ReactNode;
}) => {
    const { ref, close } = useModalDialog();
    const teardown = useRef<(() => void) | null>(null);
    const dismiss = () => {
        teardown.current?.();
        close(onClose);
    };

    return (
        <OverlayContext
            value={{
                dismiss,
                setTeardown: (next) => {
                    teardown.current = next;
                },
            }}
        >
            <dialog
                ref={ref}
                aria-labelledby={labelledBy}
                onCancel={(event) => {
                    event.preventDefault();
                    dismiss();
                }}
                onClick={(event) => {
                    if (event.target === ref.current) dismiss();
                }}
                className={className}
            >
                {children}
            </dialog>
        </OverlayContext>
    );
};

export const OverlayDrawer = ({
    onClose,
    children,
}: {
    onClose: () => void;
    children: ReactNode;
}) => (
    <OverlayShell
        className="drawer m-0 ml-auto h-dvh max-h-dvh w-120 max-w-full border-0 bg-background p-0 backdrop:bg-ink/25"
        labelledBy={DRAWER_TITLE_ID}
        onClose={onClose}
    >
        <div className="flex h-full flex-col border-l border-hairline">
            {children}
        </div>
    </OverlayShell>
);

// `panelClassName` carries the layout, because `display` stays the browser's to
// set: a `flex` class on the dialog itself would outrank the user-agent's
// `dialog:not([open]) { display: none }` and leave it laid out after it closes.
export const OverlayDialog = ({
    className,
    panelClassName,
    onClose,
    children,
}: {
    className: string;
    panelClassName: string;
    onClose: () => void;
    children: ReactNode;
}) => (
    <OverlayShell
        className={className}
        labelledBy={DIALOG_TITLE_ID}
        onClose={onClose}
    >
        <div className={panelClassName}>{children}</div>
    </OverlayShell>
);
