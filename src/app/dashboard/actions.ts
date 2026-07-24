"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
    createApplication as insertApplication,
    createList as insertList,
    deleteList as deleteListDb,
    setListPinned,
    updateList as updateListDb,
} from "@/db/dashboard";
import type { ListStatus } from "@/components/dashboard/data";
import { scrapePosting, type ScrapedPosting } from "@/lib/job-scrape";
import {
    firstIssue,
    listCreateSchema,
    listUpdateSchema,
    type ActionResult,
} from "@/lib/validation";

const NOT_SIGNED_IN = "You are not signed in." as const;

export const createList = async (
    name: string,
    description: string | null,
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsed = listCreateSchema.safeParse({ name, description });
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    await insertList(
        session.user.id,
        parsed.data.name,
        parsed.data.description,
    );
    revalidatePath("/dashboard");
    return { ok: true };
};

const EMPTY_SUGGESTION: ScrapedPosting = {
    company: null,
    role: null,
    location: null,
    pay: null,
    source: "none",
};

export const suggestFromUrl = async (
    url: string,
): Promise<ScrapedPosting> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return EMPTY_SUGGESTION;

    try {
        return await scrapePosting(url.trim());
    } catch {
        // A dead link or unreachable host just yields no suggestions; the user
        // fills the row in by hand.
        return EMPTY_SUGGESTION;
    }
};

export const addApplication = async (
    listId: string,
    input: {
        company: string;
        role: string | null;
        url: string | null;
        location: string | null;
        pay: string | null;
    },
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    const company = input.company.trim();
    if (!company) return;

    await insertApplication(session.user.id, listId, {
        company,
        role: input.role?.trim() || null,
        url: input.url?.trim() || null,
        location: input.location?.trim() || null,
        pay: input.pay?.trim() || null,
    });
    revalidatePath(`/dashboard/${listId}`);
};

export const updateList = async (
    listId: string,
    input: { name: string; description: string | null; status: ListStatus },
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsed = listUpdateSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    await updateListDb(session.user.id, listId, {
        name: parsed.data.name,
        description: parsed.data.description,
        status: parsed.data.status,
    });
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const deleteList = async (listId: string): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    await deleteListDb(session.user.id, listId);
    revalidatePath("/dashboard");
};

export const togglePin = async (
    listId: string,
    pinned: boolean,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    await setListPinned(session.user.id, listId, pinned);
    revalidatePath("/dashboard");
};
