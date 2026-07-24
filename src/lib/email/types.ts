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

export type EmailProvider = {
    fetchRecent(options: FetchOptions): Promise<NormalizedEmail[]>;
};

// Thrown when the provider rejects our credentials, so callers can prompt the
// user to reconnect rather than treating it as an empty inbox.
export class EmailAuthError extends Error {
    constructor(message = "Email authorization expired") {
        super(message);
        this.name = "EmailAuthError";
    }
}
