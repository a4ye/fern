import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// users; the rest are static marketing/legal pages with no gated content.
const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/cookies"];

export const proxy = (request: NextRequest) => {
    if (PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
        return NextResponse.next();
    }
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
};

export const config = {
    matcher: ["/((?!login|api/auth|_next|icon\\.svg).*)"],
};
