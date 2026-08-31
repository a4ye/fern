// A provider-agnostic view of an inbox message. Gmail is the only provider
// today; Outlook (Microsoft Graph) would implement the same interface so the
// classify/match/apply pipeline never has to know which inbox it came from.

export type NormalizedEmail = {
    // Provider message id. Stable across syncs, so it doubles as the dedup key.
    id: string;
    from: string;
    subject: string;
    snippet: string;
    body: string;
    receivedAt: Date;
};

export type FetchOptions = {
    maxResults: number;
    newerThanDays: number;
};

export type EmailDiscovery = {
    messageIds: string[];
    historyId: string;
    hasMore: boolean;
};

export type EmailProvider = {
    discoverRecent(options: FetchOptions): Promise<EmailDiscovery>;
    discoverSince(
        historyId: string,
        maxResults: number,
    ): Promise<EmailDiscovery>;
    fetchMessages(messageIds: string[]): Promise<NormalizedEmail[]>;
};

// Thrown when the provider rejects our credentials, so callers can prompt the
// user to reconnect rather than treating it as an empty inbox.
export class EmailAuthError extends Error {
    constructor(message = "Email authorization expired") {
        super(message);
        this.name = "EmailAuthError";
    }
}

// Gmail returns 404 when a mailbox history cursor has fallen outside its
// retained change log. Callers can then rebuild from a bounded recent scan.
export class EmailHistoryExpiredError extends Error {
    constructor(message = "Email history cursor expired") {
        super(message);
        this.name = "EmailHistoryExpiredError";
    }
}

// A message can be permanently deleted after Gmail reports it in history but
// before the sync reads it. That is a completed outcome, not a reason to leave
// the whole backlog stuck retrying the same ID forever.
export class EmailMessageUnavailableError extends Error {
    constructor(message = "Email message is no longer available") {
        super(message);
        this.name = "EmailMessageUnavailableError";
    }
}
