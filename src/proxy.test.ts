import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
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

    describe("matcher", () => {
        // These exclusions are load-bearing: if "login" or "api/auth" stopped
        // being excluded, the proxy would loop the sign-in redirect or break
        // the OAuth callback.
        it("excludes auth and internal routes from the middleware", () => {
            expect(config.matcher).toEqual([
                "/((?!login|api/auth|_next|icon\\.svg).*)",
            ]);
        });
    });
});
