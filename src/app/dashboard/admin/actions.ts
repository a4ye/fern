"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRealSession, isAdminRequest } from "@/lib/auth";
import { getUserById } from "@/db/admin";
import {
    clearViewAsTarget,
    setViewAsTarget,
    viewAsTarget,
} from "@/lib/view-as";

export const startViewAs = async (formData: FormData): Promise<void> => {
    const real = await getRealSession();
    if (!real || !(await isAdminRequest())) return;

    const userId = formData.get("userId");
    if (typeof userId !== "string" || userId === real.user.id) return;

    // The cookie is only written for an account that exists, so a stale id from
    // a page left open cannot put the dashboard into a state with nobody in it.
    if (!(await getUserById(userId))) return;

    await setViewAsTarget(real.user.id, userId);

    // The only record that an account was opened. A line rather than a table,
    // because what it is really for is a session that was not the admin's: a
    // stolen cookie can reach this page, and without any record the answer to
    // "what did they read" would have to be "assume all of it". The host keeps
    // stdout, which is where that question gets asked.
    // eslint-disable-next-line no-console
    console.info(
        `view-as admin=${real.user.id} user=${userId} at=${new Date().toISOString()}`,
    );

    // Every page under /dashboard was rendered for whoever was signed in before
    // this, and none of it belongs to the account being looked at now.
    revalidatePath("/dashboard", "layout");
    redirect("/dashboard");
};

// An exported action is an address anybody can post to, and this one used to
// answer every caller. Clearing a cookie only ever affected whoever sent it,
// but the revalidate did not: an anonymous caller in a loop emptied the render
// cache for the whole dashboard, for everyone, as often as it liked. So the
// session is required, and the cache is only dropped when there was in fact a
// viewing to stop.
export const stopViewAs = async (): Promise<void> => {
    const real = await getRealSession();
    if (!real) return;

    const viewing = Boolean(await viewAsTarget(real.user.id));
    await clearViewAsTarget();
    if (viewing) revalidatePath("/dashboard", "layout");

    redirect("/dashboard/admin");
};
