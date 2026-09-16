import { describe, expect, it } from "bun:test";
import type { ErrorEvent } from "@sentry/nextjs";
import { newShareToken, sharePath } from "@/lib/share";
import { scrubShareToken } from "@/lib/scrub-share-token";

const token = newShareToken();
const url = `https://fern.aaronye.dev${sharePath(token)}`;

const scrubbed = (event: Partial<ErrorEvent>): string =>
    JSON.stringify(scrubShareToken(event as ErrorEvent));

describe("scrubShareToken", () => {
    it("takes the token out of the request url", () => {
        const event = scrubShareToken({
            request: { url },
        } as ErrorEvent);
        expect(event.request?.url).toBe("https://fern.aaronye.dev/s/[token]");
    });

    it("takes it out of the transaction name", () => {
        const event = scrubShareToken({
            transaction: sharePath(token),
        } as ErrorEvent);
        expect(event.transaction).toBe("/s/[token]");
    });

    it("takes it out of breadcrumb messages and navigation data", () => {
        expect(
            scrubbed({
                breadcrumbs: [
                    { message: `navigated to ${url}` },
                    { data: { from: "/dashboard", to: sharePath(token) } },
                    { data: { url } },
                ],
            }),
        ).not.toContain(token);
    });

    // Server-side reporting captures local variables, so the route segment is
    // in a stack frame as a bare string with no path around it to match on.
    it("drops the token binding captured from a stack frame", () => {
        const event = scrubShareToken({
            exception: {
                values: [
                    {
                        stacktrace: {
                            frames: [{ vars: { token, other: url } }],
                        },
                    },
                ],
            },
        } as unknown as ErrorEvent);

        const frame = event.exception?.values?.[0]?.stacktrace?.frames?.[0];
        expect(frame?.vars?.token).toBe("/s/[token]");
        expect(frame?.vars?.other).toBe("https://fern.aaronye.dev/s/[token]");
    });

    it("leaves an event carrying no token alone", () => {
        const event = scrubShareToken({
            request: { url: "https://fern.aaronye.dev/dashboard" },
            transaction: "/dashboard/[season]",
        } as ErrorEvent);
        expect(event.request?.url).toBe("https://fern.aaronye.dev/dashboard");
        expect(event.transaction).toBe("/dashboard/[season]");
    });

    // Nothing else in the app is 43 base64url characters after /s/, but a
    // shorter or longer segment is not a token and must not be rewritten into
    // one, or a real 404 would be reported as a redacted share.
    it("only matches a segment the length of a real token", () => {
        const event = scrubShareToken({
            request: { url: "https://fern.aaronye.dev/s/short" },
        } as ErrorEvent);
        expect(event.request?.url).toBe("https://fern.aaronye.dev/s/short");
    });
});
