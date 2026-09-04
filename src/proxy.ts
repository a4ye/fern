import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Route prefixes that hold gated content and require a session. Anything else
// (marketing, legal, and unknown URLs) falls through so Next can serve the page
// or its 404, which is what signed-out visitors should see on a bad link.
const PROTECTED_PREFIXES = ["/dashboard"];

const isProtected = (pathname: string) =>
    PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

export const proxy = (request: NextRequest) => {
    if (!isProtected(request.nextUrl.pathname)) {
        return NextResponse.next();
    }
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
};

export const config = {
    matcher: ["/dashboard/:path*"],
};
