"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { saveUserSettings } from "@/db/settings";
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
