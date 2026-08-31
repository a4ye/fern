import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createGmailProvider } from "./gmail";
import { EmailHistoryExpiredError } from "./types";

const originalFetch = globalThis.fetch;
let responses: Response[] = [];
const fetchMock = mock(
    async (..._args: Parameters<typeof fetch>): Promise<Response> => {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected Gmail request");
        return response;
    },
);

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

beforeEach(() => {
    responses = [];
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
    globalThis.fetch = originalFetch;
});

describe("Gmail discovery", () => {
    it("takes a mailbox cursor before listing the bounded initial inbox", async () => {
        responses = [
            json({ historyId: "100" }),
            json({
                messages: [{ id: "m-2" }, { id: "m-1" }, { id: "m-2" }],
                nextPageToken: "older",
            }),
        ];

        const result = await createGmailProvider("token").discoverRecent({
            maxResults: 100,
            newerThanDays: 90,
        });

        expect(result).toEqual({
            messageIds: ["m-2", "m-1"],
            historyId: "100",
            hasMore: true,
        });
        const calls = fetchMock.mock.calls.map((call) => String(call[0]));
        expect(calls[0]).toEndWith("/profile");
        expect(calls[1]).toContain("/messages?maxResults=100");
        expect(calls[1]).toContain("newer_than%3A90d");
    });

    it("uses the last fully staged record as the cursor for a partial history page", async () => {
        responses = [
            json({
                history: [
                    {
                        id: "110",
                        messagesAdded: [
                            { message: { id: "m-1" } },
                            { message: { id: "m-1" } },
                        ],
                    },
                    {
                        id: "120",
                        messagesAdded: [{ message: { id: "m-2" } }],
                    },
                ],
                historyId: "150",
                nextPageToken: "more",
            }),
        ];

        const result = await createGmailProvider("token").discoverSince(
            "100",
            500,
        );

        expect(result).toEqual({
            messageIds: ["m-1", "m-2"],
            historyId: "120",
            hasMore: true,
        });
        const url = String(fetchMock.mock.calls[0]?.[0]);
        expect(url).toContain("startHistoryId=100");
        expect(url).toContain("historyTypes=messageAdded");
        expect(url).toContain("labelId=INBOX");
    });

    it("advances to Gmail's current cursor after the final history page", async () => {
        responses = [
            json({
                history: [
                    {
                        id: "110",
                        messagesAdded: [{ message: { id: "m-1" } }],
                    },
                ],
                historyId: "150",
            }),
        ];

        await expect(
            createGmailProvider("token").discoverSince("100", 500),
        ).resolves.toEqual({
            messageIds: ["m-1"],
            historyId: "150",
            hasMore: false,
        });
    });

    it("distinguishes an expired history cursor from other Gmail failures", async () => {
        responses = [json({ error: { message: "Not found" } }, 404)];

        await expect(
            createGmailProvider("token").discoverSince("old", 500),
        ).rejects.toBeInstanceOf(EmailHistoryExpiredError);
    });
});

describe("Gmail message reads", () => {
    it("normalizes fetched messages in the requested order", async () => {
        responses = [
            json({
                id: "m-1",
                snippet: "Snippet",
                internalDate: "1788177600000",
                payload: {
                    headers: [
                        { name: "From", value: "Recruiter <r@example.com>" },
                        { name: "Subject", value: "Interview" },
                    ],
                    mimeType: "text/plain",
                    body: {
                        data: Buffer.from("Choose a time").toString(
                            "base64url",
                        ),
                    },
                },
            }),
        ];

        const messages = await createGmailProvider("token").fetchMessages([
            "m-1",
        ]);

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            id: "m-1",
            from: "Recruiter <r@example.com>",
            subject: "Interview",
            snippet: "Snippet",
            body: "Choose a time",
        });
    });

    it("skips a message deleted after Gmail reported it", async () => {
        responses = [json({ error: { message: "Not found" } }, 404)];

        await expect(
            createGmailProvider("token").fetchMessages(["gone"]),
        ).resolves.toEqual([]);
    });
});
