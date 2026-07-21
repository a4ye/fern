import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export const proxy = (request: NextRequest) => {
    // "/" is public: the page renders the landing view for visitors
    // and the app view for signed-in users.
    if (request.nextUrl.pathname === "/") {
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
