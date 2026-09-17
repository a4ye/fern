import { NextResponse, type NextRequest } from "next/server";
import {
    getCookies,
    getSessionCookie,
    SECURE_COOKIE_PREFIX,
} from "better-auth/cookies";

// Route prefixes that hold gated content and require a session. Anything else
// (marketing, legal, and unknown URLs) falls through so Next can serve the page
// or its 404, which is what signed-out visitors should see on a bad link.
const PROTECTED_PREFIXES = ["/dashboard"];

const isProtected = (pathname: string) =>
    PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

// better-auth's own definition of the session cookie, so its name, its flags
// and the seven days it lasts stay better-auth's decision rather than a copy of
// one. src/lib/auth.ts overrides none of them. The secure prefix is asked off
// here and decided per request below, because which of the two names a browser
// holds is a fact the request carries and not one about this module's
// environment, which is the only thing better-auth could guess it from.
const { name: SESSION_NAME, attributes } = getCookies({
    advanced: { useSecureCookies: false },
}).sessionToken;
const SECURE_SESSION_NAME = `${SECURE_COOKIE_PREFIX}${SESSION_NAME}`;

// A session that is still in use slides its expiry forward, and better-auth
// stamps a fresh seven days on the cookie whenever it moves the row. A page
// cannot deliver that stamp: Next allows a cookie to be written from a Server
// Action, a Route Handler, or from here, and nowhere else. So the row slides on
// every dashboard render while the browser keeps a cookie that still expires
// seven days after sign-in, and on the seventh day it drops a session the
// database holds as live. Re-stamping the cookie already on the request costs
// no read, since how long a session lives is the row's to say and the cookie
// only has to outlast it.
//
// Only a navigation carries the stamp. Next reads any cookie written during a
// Server Action as a signal that the action changed something, and answers it
// with a re-rendered page on top of the action's own result. Stamping there
// would say that of every action, including the ones that only read, and a
// component that re-reads when the page is drawn again would never stop.
export const proxy = (request: NextRequest) => {
    if (!isProtected(request.nextUrl.pathname)) {
        return NextResponse.next();
    }
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    const response = NextResponse.next();
    if (request.method !== "GET") return response;

    const secure = request.cookies.has(SECURE_SESSION_NAME);
    response.cookies.set(
        secure ? SECURE_SESSION_NAME : SESSION_NAME,
        sessionCookie,
        {
            httpOnly: attributes.httpOnly,
            sameSite: attributes.sameSite.toLowerCase() as
                "lax" | "strict" | "none",
            secure,
            path: attributes.path,
            maxAge: attributes.maxAge,
        },
    );
    return response;
};

export const config = {
    matcher: ["/dashboard/:path*"],
};
