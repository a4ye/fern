"use client";

import { createContext, useContext, type ReactNode } from "react";

// Every write refuses while an admin is viewing another account, so the
// controls that would make one are taken off the page rather than left to fail.
// The flag reaches them through a context because the dialogs and drawers that
// carry most of them are loaded on demand, several server components below the
// layout that knows the answer. It wraps the whole dashboard rather than the
// page inside it, so there is nowhere under /dashboard where this reads false
// by accident.
const ViewingContext = createContext(false);

export const useViewing = () => useContext(ViewingContext);

export const ViewingProvider = ({
    viewing,
    children,
}: {
    viewing: boolean;
    children: ReactNode;
}) => (
    <ViewingContext.Provider value={viewing}>
        {children}
    </ViewingContext.Provider>
);
