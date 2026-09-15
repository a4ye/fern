import { cookies } from "next/headers";

// Which account an admin is looking at, and which admin is looking. Every
// request re-checks both against the browser's real session, so the cookie on
// its own grants nothing: forged in a browser that is not an admin's, or left
// behind by an admin who signed out and somebody else signed in, it is ignored.
const VIEW_AS_COOKIE = "fern.view_as";

export const VIEW_ONLY =
    "You are viewing another account, so this is read only." as const;

// No expiry, so that viewing ends where it started: at the Stop button, or with
// the browser session. A cookie that lapsed on its own would leave a page
// showing one account while the next click wrote to another, and the bar across
// the top is what makes an unnoticed viewing harmless in the meantime.
export const viewAsTarget = async (adminId: string): Promise<string | null> => {
    const value = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    const separator = value?.indexOf(":") ?? -1;
    if (!value || separator < 0) return null;

    return value.slice(0, separator) === adminId
        ? value.slice(separator + 1)
        : null;
};

export const setViewAsTarget = async (
    adminId: string,
    userId: string,
): Promise<void> => {
    (await cookies()).set(VIEW_AS_COOKIE, `${adminId}:${userId}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
    });
};

export const clearViewAsTarget = async (): Promise<void> => {
    (await cookies()).delete(VIEW_AS_COOKIE);
};
