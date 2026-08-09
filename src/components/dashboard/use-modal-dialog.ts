import { useEffect, useRef } from "react";

// The parents of these dialogs render them conditionally, so reporting the close
// straight away would unmount the element on the first frame of its exit and
// leave nothing to animate. `close` hands control back once the exit has ended.
export const useModalDialog = () => {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        ref.current?.showModal();
    }, []);

    const close = (onClosed: () => void) => {
        const dialog = ref.current;
        if (!dialog) {
            onClosed();
            return;
        }
        dialog.close();
        // Asking the element what is actually animating, rather than listening
        // for transitionend, is what keeps this from stranding the dialog closed
        // but still mounted. A browser that drops the dialog out of the top
        // layer on close never runs the transition and so never fires the event.
        // `finished` rejects when a transition is interrupted, hence allSettled.
        const running = dialog.getAnimations();
        if (running.length === 0) {
            onClosed();
            return;
        }
        void Promise.allSettled(
            running.map((animation) => animation.finished),
        ).then(onClosed);
    };

    return { ref, close };
};
