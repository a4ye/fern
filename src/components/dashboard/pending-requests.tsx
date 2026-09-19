"use client";

import {
    createContext,
    useContext,
    useOptimistic,
    type ReactNode,
} from "react";

// The number the friends icon carries. It is counted on the server in the
// dashboard layout, so every page under it draws the same answer without one of
// them having to pass it along.
//
// The friends page answers requests before the server has replied, though, and a
// badge that waited for the round trip would spend it contradicting the list
// directly below it. So that page sends its own count through here inside the
// same transition, and React drops it for the server's when the action lands.
//
// What is sent is the whole count rather than a decrement, so it says the same
// thing however many times it is applied: replayed on top of a page the server
// has already answered for, it lands on the number that page already holds
// instead of taking one off it again.
type PendingRequests = {
    pending: number;
    showPending: (count: number) => void;
};

const PendingRequestsContext = createContext<PendingRequests>({
    pending: 0,
    showPending: () => {},
});

export const usePendingRequests = () => useContext(PendingRequestsContext);

export const PendingRequestsProvider = ({
    count,
    children,
}: {
    count: number;
    children: ReactNode;
}) => {
    const [pending, showPending] = useOptimistic(
        count,
        (_counted: number, shown: number) => shown,
    );
    return (
        <PendingRequestsContext.Provider value={{ pending, showPending }}>
            {children}
        </PendingRequestsContext.Provider>
    );
};
