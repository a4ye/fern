import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { EmailProvider, NormalizedEmail } from "./types";
import { EmailHistoryExpiredError } from "./types";

let historyId: string | null = null;
let pendingBatches: string[][] = [];
let remaining = 0;

const getEmailSyncState = mock(async () => ({
    historyId,
    lastSyncedAt: null,
}));
const stageEmailSyncMessages = mock(async () => undefined);
const listPendingEmailSyncMessageIds = mock(
    async (..._args: [string, number]) => pendingBatches.shift() ?? [],
);
const countPendingEmailSyncMessages = mock(async () => remaining);
const getApplicationsForUser = mock(async () => [
    {
        id: "application-1",
        company: "Acme",
        role: "Engineer",
        status: "applied" as const,
    },
]);
const completeEmailSyncMessages = mock(
    async (..._args: [string, string[], unknown[]]) => 1,
);
const classifyEmails = mock(async () => [
    {
        emailIndex: 0,
        applicationIndex: 0,
        suggestedStatus: "interviewing" as const,
        confidence: 0.9,
        reasoning: "The recruiter requested an interview.",
    },
]);

mock.module("@/db/email", () => ({
    getEmailSyncState,
    stageEmailSyncMessages,
    listPendingEmailSyncMessageIds,
    countPendingEmailSyncMessages,
    getApplicationsForUser,
    completeEmailSyncMessages,
}));
mock.module("@/lib/email/classify", () => ({ classifyEmails }));

const { syncEmailInbox } = await import("./sync");

// Names the tracked company, since an email that names nobody never reaches the
// classifier at all. That case has a test of its own below.
const email = (id: string): NormalizedEmail => ({
    id,
    from: "Recruiter <r@acme.com>",
    subject: "Interview with Acme",
    snippet: "Choose a time",
    body: "Choose a time for your interview with Acme.",
    receivedAt: new Date("2026-08-31T12:00:00.000Z"),
});

const provider = (
    recentMessageIds: string[] = ["m-1", "m-2"],
): EmailProvider => ({
    discoverRecent: mock(async () => ({
        messageIds: recentMessageIds,
        historyId: "100",
        hasMore: false,
    })),
    discoverSince: mock(async () => ({
        messageIds: ["m-3"],
        historyId: "120",
        hasMore: false,
    })),
    fetchMessages: mock(async (ids: string[]) => ids.map(email)),
});

beforeEach(() => {
    historyId = null;
    pendingBatches = [];
    remaining = 0;
    getEmailSyncState.mockClear();
    stageEmailSyncMessages.mockClear();
    listPendingEmailSyncMessageIds.mockClear();
    countPendingEmailSyncMessages.mockClear();
    getApplicationsForUser.mockClear();
    completeEmailSyncMessages.mockClear();
    classifyEmails.mockClear();
});

describe("syncEmailInbox", () => {
    it("drains the initial scan in internal model-sized batches", async () => {
        const messageIds = Array.from(
            { length: 30 },
            (_, index) => `m-${index + 1}`,
        );
        pendingBatches = [messageIds.slice(0, 25), messageIds.slice(25)];
        const gmail = provider(messageIds);

        const result = await syncEmailInbox("user-1", gmail);

        expect(gmail.discoverRecent).toHaveBeenCalledWith({
            maxResults: 100,
            newerThanDays: 90,
        });
        expect(stageEmailSyncMessages).toHaveBeenCalledWith(
            "user-1",
            messageIds,
            "100",
        );
        expect(listPendingEmailSyncMessageIds).toHaveBeenNthCalledWith(
            1,
            "user-1",
            25,
        );
        expect(listPendingEmailSyncMessageIds).toHaveBeenNthCalledWith(
            2,
            "user-1",
            25,
        );
        expect(completeEmailSyncMessages).toHaveBeenCalledTimes(2);
        expect(completeEmailSyncMessages.mock.calls[0]?.[1]).toEqual(
            messageIds.slice(0, 25),
        );
        expect(completeEmailSyncMessages.mock.calls[1]?.[1]).toEqual(
            messageIds.slice(25),
        );
        expect(result).toMatchObject({
            found: 2,
            scanned: 30,
            remaining: 0,
            hasMore: false,
            rebuiltHistory: true,
        });
    });

    it("caps one sync at 100 messages while preserving the backlog", async () => {
        const messageIds = Array.from(
            { length: 100 },
            (_, index) => `m-${index + 1}`,
        );
        pendingBatches = Array.from({ length: 4 }, (_, index) =>
            messageIds.slice(index * 25, (index + 1) * 25),
        );
        remaining = 5;

        const result = await syncEmailInbox("user-1", provider(messageIds));

        expect(listPendingEmailSyncMessageIds).toHaveBeenCalledTimes(4);
        expect(completeEmailSyncMessages).toHaveBeenCalledTimes(4);
        expect(result).toMatchObject({
            found: 4,
            scanned: 100,
            remaining: 5,
            hasMore: true,
        });
    });

    it("uses the stored history cursor for later discovery", async () => {
        historyId = "100";
        pendingBatches = [["m-3"]];
        const gmail = provider();

        await syncEmailInbox("user-1", gmail);

        expect(gmail.discoverSince).toHaveBeenCalledWith("100", 500);
        expect(gmail.discoverRecent).not.toHaveBeenCalled();
        expect(stageEmailSyncMessages).toHaveBeenCalledWith(
            "user-1",
            ["m-3"],
            "120",
        );
    });

    it("rebuilds from a bounded recent scan when Gmail expires the cursor", async () => {
        historyId = "old";
        const gmail = provider();
        gmail.discoverSince = mock(async () => {
            throw new EmailHistoryExpiredError();
        });

        const result = await syncEmailInbox("user-1", gmail);

        expect(gmail.discoverRecent).toHaveBeenCalledTimes(1);
        expect(result.rebuiltHistory).toBe(true);
        expect(completeEmailSyncMessages).toHaveBeenCalledWith(
            "user-1",
            [],
            [],
        );
    });

    it("marks irrelevant messages processed without creating suggestions", async () => {
        pendingBatches = [["m-1"]];
        classifyEmails.mockImplementationOnce(async () => []);
        completeEmailSyncMessages.mockImplementationOnce(async () => 0);

        const result = await syncEmailInbox("user-1", provider());

        expect(completeEmailSyncMessages).toHaveBeenCalledWith(
            "user-1",
            ["m-1"],
            [],
        );
        expect(result.found).toBe(0);
        expect(result.scanned).toBe(1);
    });

    // The model is the only part of a sync that costs money per call, and most
    // of an inbox is nothing to do with any application.
    it("never pays the model for a batch that names nobody tracked", async () => {
        pendingBatches = [["m-1"]];
        const bill: NormalizedEmail = {
            id: "m-1",
            from: "billing@hydroone.com",
            subject: "Your electricity bill is ready",
            snippet: "Your balance is due",
            body: "Your account balance is due on the 15th of the month.",
            receivedAt: new Date("2026-08-31T12:00:00.000Z"),
        };

        const result = await syncEmailInbox("user-1", {
            ...provider(),
            fetchMessages: mock(async () => [bill]),
        });

        expect(classifyEmails).not.toHaveBeenCalled();
        // Still resolved, so it is never fetched or looked at again.
        expect(completeEmailSyncMessages).toHaveBeenCalledWith(
            "user-1",
            ["m-1"],
            [],
        );
        expect(result.scanned).toBe(0);
    });
});
