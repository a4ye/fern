import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { config, proxy } from "@/proxy";

// The exact cookie better-auth sets for an authenticated session over https.
// The proxy calls getSessionCookie with default config, so this is the real
// name it reads. Driving the real function with this (instead of mocking) means
// the test breaks if better-auth's cookie naming ever drifts.
const SESSION_COOKIE = "__Secure-better-auth.session_token";
const SIGNED_IN = `${SESSION_COOKIE}=abc.def`;

const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/cookies"];
const GATED_PATH = "/dashboard";

const requestFor = (path: string, cookie?: string) =>
    new NextRequest(new URL(path, "https://tracker.test"), {
        headers: cookie ? { cookie } : undefined,
    });

const actionRequestFor = (path: string, cookie: string) =>
    new NextRequest(new URL(path, "https://tracker.test"), {
        method: "POST",
        headers: { cookie, "next-action": "abc123" },
    });

const expectPassThrough = (res: Response) => {
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
};

const expectRedirectToLogin = (res: Response) => {
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://tracker.test/login");
};

describe("proxy", () => {
    describe("public paths", () => {
        for (const path of PUBLIC_PATHS) {
            it(`serves ${path} to signed-out visitors`, () => {
                expectPassThrough(proxy(requestFor(path)));
            });

            it(`serves ${path} to signed-in users`, () => {
                expectPassThrough(proxy(requestFor(path, SIGNED_IN)));
            });
        }
    });

    describe("gated paths", () => {
        it("redirects signed-out visitors to /login", () => {
            expectRedirectToLogin(proxy(requestFor(GATED_PATH)));
        });

        it("ignores unrelated cookies when checking for a session", () => {
            expectRedirectToLogin(
                proxy(requestFor(GATED_PATH, "theme=dark; visited=1")),
            );
        });

        it("admits requests carrying the session cookie", () => {
            expectPassThrough(proxy(requestFor(GATED_PATH, SIGNED_IN)));
        });
    });

    describe("session lifetime", () => {
        // A session token is the token, a dot, and a base64 signature, so the
        // value holds characters that a serializer can escape or drop. Writing
        // the cookie back is only safe if the bytes that arrive are the bytes
        // that leave, and better-auth is the judge of that: a signature it
        // cannot read is a session the user no longer has.
        const SIGNED = "8Kq2vWxNpL.hK3+f/9Zq8w4TmN1xGdR2sVbY6cA0eJk=";
        const sentBack = (res: Response) =>
            (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

        it("returns a session cookie better-auth can still read", () => {
            const res = proxy(
                requestFor(GATED_PATH, `${SESSION_COOKIE}=${SIGNED}`),
            );
            expect(
                getSessionCookie(new Headers({ cookie: sentBack(res) })),
            ).toBe(SIGNED);
        });

        it("gives the cookie a fresh seven days on every visit", () => {
            const res = proxy(requestFor(GATED_PATH, SIGNED_IN));
            expect(res.headers.get("set-cookie")).toContain(
                `Max-Age=${60 * 60 * 24 * 7}`,
            );
        });

        it("keeps the protections the cookie was signed in with", () => {
            const header = proxy(requestFor(GATED_PATH, SIGNED_IN)).headers.get(
                "set-cookie",
            );
            expect(header).toContain("HttpOnly");
            expect(header).toContain("Secure");
            expect(header).toContain("SameSite=lax");
            expect(header).toContain("Path=/");
        });

        it("writes nothing on a path it does not guard", () => {
            expect(
                proxy(requestFor("/", SIGNED_IN)).headers.get("set-cookie"),
            ).toBeNull();
        });

        // Next reads a cookie written during a Server Action as proof the
        // action changed something, and re-renders the page alongside the
        // action's own answer. A stamp here would say that of every read, and
        // anything that re-reads when the page is drawn again would call
        // itself in a loop. Navigations carry the stamp often enough.
        it("writes nothing on a server action", () => {
            const res = proxy(actionRequestFor(GATED_PATH, SIGNED_IN));
            expectPassThrough(res);
            expect(res.headers.get("set-cookie")).toBeNull();
        });

        it("still turns a server action away without a session", () => {
            expectRedirectToLogin(proxy(actionRequestFor(GATED_PATH, "a=1")));
        });
    });

    describe("matcher", () => {
        it("only invokes the proxy for dashboard routes", () => {
            expect(config.matcher).toEqual(["/dashboard/:path*"]);
        });
    });
});
