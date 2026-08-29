export const HISTORY_INITIAL_PAGE_SIZE = 10;
export const HISTORY_APPLICATIONS_PAGE_SIZE = 10;
export const HISTORY_CHANGES_PREVIEW_SIZE = 8;
export const HISTORY_CHANGES_PAGE_SIZE = 24;

export type HistoryApplicationStatusEntry = {
    action: "added" | "removed" | "restored";
    from: string | null;
    to: string | null;
    note: string | null;
};

export type HistoryApplicationDetail = {
    application: string;
    statusEntries: HistoryApplicationStatusEntry[];
};

export type HistoryApplicationsPage = {
    applications: string[];
    applicationDetails?: HistoryApplicationDetail[];
    page: number;
    pageCount: number;
    total: number;
};
