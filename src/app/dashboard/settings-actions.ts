"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteAccount as deleteAccountDb } from "@/db/account";
import { markOnboarded, saveUserSettings } from "@/db/settings";
import { withinBudget } from "@/db/rate-limit";
import { TOO_MANY_REQUESTS } from "@/lib/limits";
import {
    accountSettingsSchema,
    firstIssue,
    type ActionResult,
} from "@/lib/validation";

const NOT_SIGNED_IN = "You are not signed in." as const;

export const saveAccountSettings = async (input: {
    name: string;
    defaultCurrency: string;
    cleanLinks: boolean;
    employerLinks: boolean;
    tidyTitles: boolean;
}): Promise<ActionResult> => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };
    if (!(await withinBudget(session.user.id, "write"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }

    const parsed = accountSettingsSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    await saveUserSettings(session.user.id, {
        defaultCurrency: parsed.data.defaultCurrency,
        cleanLinks: parsed.data.cleanLinks,
        employerLinks: parsed.data.employerLinks,
        tidyTitles: parsed.data.tidyTitles,
    });

    // The name lives on the account record better-auth owns, and its endpoint
    // rejects a body with nothing in it, so an unchanged name is left alone.
    if (parsed.data.name !== session.user.name) {
        await auth.api.updateUser({
            headers: requestHeaders,
            body: { name: parsed.data.name },
        });
    }

    // The name is drawn by the dashboard layout and the default currency by
    // every list's create form, so the whole tree under it is stale.
    revalidatePath("/dashboard", "layout");
    return { ok: true };
};

// The caller closes the welcome before this resolves, because the dismissal is
// what the user asked for and it should not wait on a round trip. A failure
// here costs one more sighting on the next visit, which is why it is not raised
// to the user: there is nothing for them to do about it and nothing is lost.
export const completeOnboarding = async (): Promise<ActionResult> => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };
    if (!(await withinBudget(session.user.id, "write"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }

    await markOnboarded(session.user.id);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const deleteAccount = async (): Promise<ActionResult> => {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };
    if (!(await withinBudget(session.user.id, "write"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }

    // Signing out first is the one step that needs the session it ends, and it
    // is what clears the browser's cookie. If the delete below then fails, the
    // account is untouched and signing in again reaches all of it.
    await auth.api.signOut({ headers: requestHeaders });
    await deleteAccountDb(session.user.id);

    // Nothing under /dashboard has an owner any more, so drop what was rendered
    // for the account rather than let a cached page outlive it.
    revalidatePath("/dashboard", "layout");
    return { ok: true };
};
