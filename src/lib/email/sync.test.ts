import { beforeEach, describe, expect, it, mock } from "bun:test";
import { MAX_EMAILS_PER_SYNC } from "@/lib/limits";
import type { UserApplication } from "@/db/email";
import type { ClassifierApplication, EmailMatch } from "./matches";
import type { EmailProvider, NormalizedEmail } from "./types";
import { EmailHistoryExpiredError } from "./types";

// Mirrors PROCESSING_BATCH_LIMIT, which sync.ts keeps to itself.
const BATCH_SIZE = 25;

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
const getApplicationsForUser = mock(async (): Promise<UserApplication[]> => [
    {
        id: "application-1",
        company: "Acme",
        role: "Engineer",
        status: "applied",
        appliedAt: null,
    },
]);
const completeEmailSyncMessages = mock(
    async (..._args: [string, string[], unknown[]]) => 1,
);
const classifyEmails = mock(
    async (
        ..._args: [ClassifierApplication[], readonly NormalizedEmail[]]
    ): Promise<EmailMatch[]> => [
        {
            emailIndex: 0,
            applicationIndex: 0,
            suggestedStatus: "interviewing",
            newRound: false,
            confidence: 0.9,
            reasoning: "The recruiter requested an interview.",
        },
    ],
);

mock.module("@/db/email", () => ({
    getEmailSyncState,
    stageEmailSyncMessages,
    listPendingEmailSyncMessageIds,
    countPendingEmailSyncMessages,
    getApplicationsForUser,
    completeEmailSyncMessages,
}));
// `classifyEmails` above stands in for Jev, which is the default, so every
// test about how a sync is organised reaches it without saying so. Gemini gets
// its own so the one test that cares which was picked can tell them apart.
const geminiClassify = mock(
    async (
        ..._args: [ClassifierApplication[], readonly NormalizedEmail[]]
    ): Promise<EmailMatch[]> => [],
);

mock.module("@/lib/email/classify-jev", () => ({ classifyEmails }));
mock.module("@/lib/email/classify", () => ({
    classifyEmails: geminiClassify,
}));

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
    geminiClassify.mockClear();
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
            maxResults: MAX_EMAILS_PER_SYNC,
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

    // The ceiling is reached with the queue still full, so the loop has to stop
    // on its own count rather than on running out of pending messages.
    it("caps one sync at the per-sync ceiling while preserving the backlog", async () => {
        const messageIds = Array.from(
            { length: MAX_EMAILS_PER_SYNC },
            (_, index) => `m-${index + 1}`,
        );
        const batches = MAX_EMAILS_PER_SYNC / BATCH_SIZE;
        pendingBatches = Array.from({ length: batches }, (_, index) =>
            messageIds.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
        );
        remaining = 5;

        const result = await syncEmailInbox("user-1", provider(messageIds));

        expect(listPendingEmailSyncMessageIds).toHaveBeenCalledTimes(batches);
        expect(completeEmailSyncMessages).toHaveBeenCalledTimes(batches);
        expect(result).toMatchObject({
            found: batches,
            scanned: MAX_EMAILS_PER_SYNC,
            remaining: 5,
            hasMore: true,
        });
    });

    // A Gmail round of twenty-five leaves about eleven emails that name
    // anybody tracked. Tying a model call to a round would send every one of
    // them less than half full and pay the same for it, so the survivors are
    // collected across rounds instead.
    it("fills one model call from several Gmail rounds", async () => {
        // Five of every twenty-five name the tracked company.
        const ids = (round: number) =>
            Array.from({ length: 25 }, (_, at) =>
                at < 5 ? `keep-${round}-${at}` : `drop-${round}-${at}`,
            );
        const bill = (id: string): NormalizedEmail => ({
            id,
            from: "billing@hydroone.com",
            subject: "Your electricity bill is ready",
            snippet: "Your balance is due",
            body: "Your account balance is due on the 15th.",
            receivedAt: new Date("2026-08-31T12:00:00.000Z"),
        });
        pendingBatches = [ids(1), ids(2)];

        const result = await syncEmailInbox("user-1", {
            ...provider(),
            fetchMessages: mock(async (requested: string[]) =>
                requested.map((id) =>
                    id.startsWith("keep-") ? email(id) : bill(id),
                ),
            ),
        });

        // One call, not one per round, and it carries both rounds' survivors.
        expect(classifyEmails).toHaveBeenCalledTimes(1);
        expect(classifyEmails.mock.calls[0]?.[1]).toHaveLength(10);
        expect(result.scanned).toBe(10);

        // The mail naming nobody is settled per round, so it is never fetched
        // again while the survivors wait for a group to fill.
        const settled = completeEmailSyncMessages.mock.calls.map(
            (call) => call[1],
        );
        expect(settled[0]).toEqual(ids(1).slice(5));
        expect(settled[1]).toEqual(ids(2).slice(5));
        expect(settled[2]).toEqual([
            ...ids(1).slice(0, 5),
            ...ids(2).slice(0, 5),
        ]);
    });

    it("runs two model calls at once", async () => {
        let active = 0;
        let mostAtOnce = 0;
        // Registered per call rather than as the implementation, so the shared
        // default is still there for the tests that follow.
        const watched = async (): Promise<EmailMatch[]> => {
            active += 1;
            mostAtOnce = Math.max(mostAtOnce, active);
            await new Promise((resolve) => setTimeout(resolve, 20));
            active -= 1;
            return [];
        };
        classifyEmails.mockImplementationOnce(watched);
        classifyEmails.mockImplementationOnce(watched);

        // Two full groups, so the second is scheduled while the first is still
        // waiting on the model.
        const ids = Array.from({ length: 50 }, (_, at) => `m-${at}`);
        pendingBatches = [ids.slice(0, 25), ids.slice(25)];

        await syncEmailInbox("user-1", {
            ...provider(ids),
            fetchMessages: mock(async (requested: string[]) =>
                requested.map(email),
            ),
        });

        expect(classifyEmails).toHaveBeenCalledTimes(2);
        expect(mostAtOnce).toBe(2);
    });

    // The setting names which model reads the inbox, and the two are loaded
    // separately so a sync never pulls in the SDK behind the one it is not
    // using.
    it("asks the classifier the settings name", async () => {
        pendingBatches = [["m-1"]];
        await syncEmailInbox("user-1", provider(["m-1"]), "gemini");

        expect(geminiClassify).toHaveBeenCalledTimes(1);
        expect(classifyEmails).not.toHaveBeenCalled();
    });

    it("reads the inbox with Jev unless told otherwise", async () => {
        pendingBatches = [["m-1"]];
        await syncEmailInbox("user-1", provider(["m-1"]));

        expect(classifyEmails).toHaveBeenCalledTimes(1);
        expect(geminiClassify).not.toHaveBeenCalled();
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

    // A company announces one decision several times: the invitation, the
    // calendar note, the reminder. Each is a separate email, and all of them
    // say the same thing about the application.
    it("asks once when several emails announce the same move", async () => {
        pendingBatches = [["m-1", "m-2"]];
        classifyEmails.mockImplementationOnce(async () => [
            {
                emailIndex: 0,
                applicationIndex: 0,
                suggestedStatus: "interviewing",
                newRound: false,
                confidence: 0.6,
                reasoning: "The email mentions an interview.",
            },
            {
                emailIndex: 1,
                applicationIndex: 0,
                suggestedStatus: "interviewing",
                newRound: false,
                confidence: 0.95,
                reasoning: "The recruiter requested an interview.",
            },
        ]);

        await syncEmailInbox("user-1", provider(["m-1", "m-2"]));

        const suggestions = completeEmailSyncMessages.mock.calls[0]?.[2];
        expect(suggestions).toHaveLength(1);
        // The plainest of the two, not whichever was read first.
        expect(suggestions?.[0]).toMatchObject({
            messageId: "m-2",
            suggestedStatus: "interviewing",
        });
    });

    it("keeps two different moves on one application apart", async () => {
        pendingBatches = [["m-1", "m-2"]];
        classifyEmails.mockImplementationOnce(async () => [
            {
                emailIndex: 0,
                applicationIndex: 0,
                suggestedStatus: "interviewing",
                newRound: false,
                confidence: 0.9,
                reasoning: "The recruiter requested an interview.",
            },
            {
                emailIndex: 1,
                applicationIndex: 0,
                suggestedStatus: "rejected",
                newRound: false,
                confidence: 0.8,
                reasoning: "The company is moving ahead with others.",
            },
        ]);

        await syncEmailInbox("user-1", provider(["m-1", "m-2"]));

        expect(completeEmailSyncMessages.mock.calls[0]?.[2]).toHaveLength(2);
    });

    it("suggests a further round at the status already held", async () => {
        getApplicationsForUser.mockImplementationOnce(async () => [
            {
                id: "application-1",
                company: "Acme",
                role: "Engineer",
                status: "interviewing",
                appliedAt: null,
            },
        ]);
        pendingBatches = [["m-1"]];
        classifyEmails.mockImplementationOnce(async () => [
            {
                emailIndex: 0,
                applicationIndex: 0,
                suggestedStatus: "interviewing",
                newRound: true,
                confidence: 0.9,
                reasoning: "The recruiter invited a second round.",
            },
        ]);

        await syncEmailInbox("user-1", provider(["m-1"]));

        expect(completeEmailSyncMessages.mock.calls[0]?.[2]).toHaveLength(1);
    });

    // Without the flag this is a reminder about the round already arranged,
    // which reports no change at all.
    it("ignores a repeat of the current status that is not a new round", async () => {
        getApplicationsForUser.mockImplementationOnce(async () => [
            {
                id: "application-1",
                company: "Acme",
                role: "Engineer",
                status: "interviewing",
                appliedAt: null,
            },
        ]);
        pendingBatches = [["m-1"]];
        classifyEmails.mockImplementationOnce(async () => [
            {
                emailIndex: 0,
                applicationIndex: 0,
                suggestedStatus: "interviewing",
                newRound: false,
                confidence: 0.9,
                reasoning: "The email confirms the interview time.",
            },
        ]);

        await syncEmailInbox("user-1", provider(["m-1"]));

        expect(completeEmailSyncMessages.mock.calls[0]?.[2]).toEqual([]);
    });

    // The co-op notice names no employer, only the Discord server it links.
    // Tower reaches the prompt through the other email, and the model ties
    // the notice to it as the one offer in progress.
    it("drops a match the email never names", async () => {
        getApplicationsForUser.mockImplementationOnce(async () => [
            {
                id: "application-1",
                company: "Discord",
                role: "Engineer",
                status: "applied",
                appliedAt: null,
            },
            {
                id: "application-2",
                company: "Tower Research Capital",
                role: "Quant Intern",
                status: "offer_in_progress",
                appliedAt: null,
            },
        ]);
        pendingBatches = [["m-1", "m-2"]];
        const messages: NormalizedEmail[] = [
            {
                id: "m-1",
                from: "recruiting@towerresearch.com",
                subject: "Your offer from Tower Research",
                snippet: "",
                body: "Please review the attached offer.",
                receivedAt: new Date("2026-08-31T12:00:00.000Z"),
            },
            {
                id: "m-2",
                from: "Co-operative Education <ceehub@uwaterloo.ca>",
                subject: "Congratulations on a match!",
                snippet: "",
                body: "Join co-op students on the Co-op Connection Discord.",
                receivedAt: new Date("2026-08-31T12:00:00.000Z"),
            },
        ];
        classifyEmails.mockImplementationOnce(async () => [
            {
                emailIndex: 1,
                applicationIndex: 1,
                suggestedStatus: "offer_accepted",
                newRound: false,
                confidence: 0.9,
                reasoning: "You have been matched with a job.",
            },
        ]);

        await syncEmailInbox("user-1", {
            ...provider(["m-1", "m-2"]),
            fetchMessages: mock(async () => messages),
        });

        expect(completeEmailSyncMessages.mock.calls[0]?.[2]).toEqual([]);
    });

    // Naming the company and proposing a move it has not made, this one gets
    // past every other guard, so it has to be stopped before the model reads
    // it at all.
    it("never asks about a company's privacy notice", async () => {
        pendingBatches = [["m-1"]];
        const notice: NormalizedEmail = {
            id: "m-1",
            from: "no-reply@us.greenhouse-mail.io",
            subject: "Privacy and Compliance Notification from Acme",
            snippet: "We require your consent to keep storing your details",
            body: "In line with data protection laws, Acme requires your consent to keep storing your personal details for recruitment purposes.",
            receivedAt: new Date("2026-08-31T12:00:00.000Z"),
        };

        const result = await syncEmailInbox("user-1", {
            ...provider(),
            fetchMessages: mock(async () => [notice]),
        });

        expect(classifyEmails).not.toHaveBeenCalled();
        expect(completeEmailSyncMessages).toHaveBeenCalledWith(
            "user-1",
            ["m-1"],
            [],
        );
        expect(result.scanned).toBe(0);
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
