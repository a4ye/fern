import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export const proxy = (request: NextRequest) => {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
};

export const config = {
    matcher: ["/((?!login|api/auth|_next|icon\\.svg).*)"],
};
