// TypeSafe's System One API: unstructured state in, typed answers out. Nothing
// here is specific to email, so anything in the app that wants a judgment it can
// branch on rather than a paragraph it has to parse comes through this file.
//
// The model writes no text at all, which is the point of it. Every answer is a
// value from a set the caller named, so a reply that does not fit the shape the
// caller asked for is not something that can happen.

import {
    TYPESAFE_INPUT_TOKENS_PER_SECOND,
    TYPESAFE_REQUESTS_PER_SECOND,
} from "@/lib/limits";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

// What one option of a Choice is for. A bare string where the name nearly says
// it, null where it says it outright, and the long form where an option has to
// be told apart from its neighbours: `not_for` is what keeps a near miss out,
// and is where a rule learned from a wrong answer belongs.
export type JevCriterion =
    | string
    | null
    | {
          what: string;
          not_for?: string;
          examples?: string[];
      };

// Choice names one option from a set. Noul answers whether a statement holds,
// as a probability rather than a yes. Score places the state on a rubric.
export type JevQuestion =
    | {
          type: "choice";
          instructions: string;
          criteria: Record<string, JevCriterion>;
      }
    // The instruction carries most Nouls on its own. Criteria are for where the
    // line between yes and no is subtle enough to be worth drawing twice.
    | {
          type: "noul";
          instructions: string;
          criteria?: { true: string; false: string };
      }
    | {
          type: "score";
          instructions: string;
          criteria: Record<string, JevCriterion>;
      };

export type JevAnswer = {
    type: string;
    choice?: string;
    noul?: number;
    score?: string;
    // How concentrated the distribution is. A flat spread reads as low
    // confidence, which is the signal a threshold is drawn against.
    confidence?: number;
    probabilities?: Record<string, number>;
};

export type JevReply = {
    answers: Record<string, JevAnswer>;
    inputTokens: number;
    ms: number;
};

export class TypesafeError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = "TypesafeError";
        this.status = status;
    }
}

// Roughly four characters to the token, which is the usual English ratio and
// close enough for a budget: the figure only decides how long to wait, and the
// reply carries the real count for anyone measuring.
export const estimateTokens = (body: string): number =>
    Math.ceil(body.length / 4);

type Spend = { at: number; tokens: number };

// What this process has spent in the last second, by request and by token. Both
// ceilings are checked before a call goes out rather than after one comes back
// refused, because a refusal costs the same round trip as the call would have.
//
// This paces one process. The limit itself belongs to the organisation and is
// shared across every key and every instance, which no amount of counting in
// memory can see; `takeSharedBudget` in src/db/rate-limit.ts is what holds the
// app as a whole inside it, charged once per group before any of it goes out.
// What this does is keep a single group from arriving all at once.
let spent: Spend[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const reserve = async (tokens: number): Promise<void> => {
    if (tokens > TYPESAFE_INPUT_TOKENS_PER_SECOND) {
        throw new TypesafeError(
            413,
            `One request of about ${tokens} input tokens is past the ` +
                `${TYPESAFE_INPUT_TOKENS_PER_SECOND} a second allowed, so no ` +
                `amount of waiting lets it through. Send less state.`,
        );
    }

    for (;;) {
        const now = Date.now();
        spent = spent.filter((entry) => now - entry.at < 1000);
        const used = spent.reduce((total, entry) => total + entry.tokens, 0);

        // Taken in the same tick as the check, so two callers arriving together
        // cannot both read the same headroom and both take it.
        if (
            spent.length < TYPESAFE_REQUESTS_PER_SECOND &&
            used + tokens <= TYPESAFE_INPUT_TOKENS_PER_SECOND
        ) {
            spent.push({ at: now, tokens });
            return;
        }

        // Wait for the oldest spend to age out of the window, which is the
        // soonest anything can change.
        const oldest = spent[0]?.at ?? now;
        await sleep(Math.max(1000 - (now - oldest), 5));
    }
};

export const askJev = async (
    state: unknown,
    questions: Record<string, JevQuestion>,
): Promise<JevReply> => {
    const key = process.env.TYPESAFE_API_KEY;
    if (!key) throw new TypesafeError(401, "TYPESAFE_API_KEY is not set.");

    const body = JSON.stringify({ state, model: MODEL, questions });
    await reserve(estimateTokens(body));

    const start = performance.now();
    const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body,
    });
    const ms = performance.now() - start;

    if (!response.ok) {
        // Being refused for pace means the shared budget was spent by someone
        // else, so the wait is theirs to say rather than ours to guess.
        if (response.status === 429) {
            const after = Number(response.headers.get("retry-after") ?? "1");
            await sleep(Number.isFinite(after) ? after * 1000 : 1000);
        }
        throw new TypesafeError(
            response.status,
            `TypeSafe refused (${response.status}): ${(await response.text()).slice(0, 200)}`,
        );
    }

    const payload = (await response.json()) as {
        answers: Record<string, JevAnswer>;
        usage?: { input_tokens?: number };
    };
    return {
        answers: payload.answers,
        inputTokens: payload.usage?.input_tokens ?? 0,
        ms,
    };
};
