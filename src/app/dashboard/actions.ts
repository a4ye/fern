"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
    createApplication as insertApplication,
    createList as insertList,
    deleteApplication as deleteApplicationDb,
    deleteApplications as deleteApplicationsDb,
    deleteList as deleteListDb,
    applyStatusStepEdits as applyStatusStepEditsDb,
    saveApplicationDetail as saveApplicationDetailDb,
    setApplicationsArrangement as setApplicationsArrangementDb,
    setApplicationsStatus as setApplicationsStatusDb,
    setListPinned,
    updateApplications as updateApplicationsDb,
    updateList as updateListDb,
} from "@/db/dashboard";
import type {
    ApplicationStatus,
    Arrangement,
    ListStatus,
    PayPeriod,
} from "@/components/dashboard/data";
import { scrapePosting, type ScrapedPosting } from "@/lib/job-scrape";
import {
    applicationDetailSchema,
    applicationSchema,
    firstIssue,
    listCreateSchema,
    listUpdateSchema,
    stepEditsSchema,
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
    arrangement: null,
    pay: null,
    source: "none",
};

export const suggestFromUrl = async (url: string): Promise<ScrapedPosting> => {
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

export type ApplicationDraft = {
    company: string;
    role: string | null;
    status: ApplicationStatus;
    location: string | null;
    arrangement: Arrangement | null;
    pay: string | null;
    appliedAt: string | null;
    url: string | null;
};

// What the panel stages while it is open: the ids of recorded steps it dropped,
// and the statuses it queued, in the order they were added.
export type ApplicationStepEdits = {
    removed: string[];
    added: ApplicationStatus[];
};

export type ApplicationDetailDraft = {
    company: string;
    role: string | null;
    location: string | null;
    arrangement: Arrangement | null;
    appliedAt: string | null;
    url: string | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    bonus: string | null;
    payNote: string | null;
    notes: string | null;
};

export const addApplication = async (
    listId: string,
    input: ApplicationDraft,
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsed = applicationSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    await insertApplication(session.user.id, listId, parsed.data);
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

// Bulk save from the edit-all grid. One bad row rejects the whole batch, named
// in the message, so a typo can't be silently dropped while its neighbours save.
// `payTyped` marks the rows whose pay box was actually edited, which are the
// only ones whose pay columns are rewritten from it.
export const updateApplicationsBulk = async (
    listId: string,
    rows: { id: string; input: ApplicationDraft; payTyped: boolean }[],
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsedRows = [];
    for (const row of rows) {
        const parsed = applicationSchema.safeParse(row.input);
        if (!parsed.success) {
            const label = row.input.company.trim() || "a row";
            return {
                ok: false,
                error: `${label}: ${firstIssue(parsed.error)}`,
            };
        }
        parsedRows.push({
            id: row.id,
            input: parsed.data,
            payTyped: row.payTyped,
        });
    }

    await updateApplicationsDb(session.user.id, parsedRows);
    revalidatePath(`/dashboard/${listId}`);
    return { ok: true };
};

// The detail panel's save: every column an application has, plus the history
// edits staged beside them. Recording a step is how the status moves, and the
// status the application already sits at is a step like any other, which is how
// a second interview gets logged.
export const saveApplicationDetail = async (
    listId: string,
    applicationId: string,
    input: ApplicationDetailDraft,
    steps: ApplicationStepEdits,
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsed = applicationDetailSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    const parsedSteps = stepEditsSchema.safeParse(steps);
    if (!parsedSteps.success) {
        return { ok: false, error: firstIssue(parsedSteps.error) };
    }

    await saveApplicationDetailDb(session.user.id, applicationId, parsed.data);
    await applyStatusStepEditsDb(
        session.user.id,
        applicationId,
        parsedSteps.data,
    );
    revalidatePath(`/dashboard/${listId}`);
    return { ok: true };
};

export const setApplicationsStatus = async (
    listId: string,
    applicationIds: string[],
    status: ApplicationStatus,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || applicationIds.length === 0) return;

    await setApplicationsStatusDb(session.user.id, applicationIds, status);
    revalidatePath(`/dashboard/${listId}`);
};

export const setApplicationsArrangement = async (
    listId: string,
    applicationIds: string[],
    arrangement: Arrangement | null,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || applicationIds.length === 0) return;

    await setApplicationsArrangementDb(
        session.user.id,
        applicationIds,
        arrangement,
    );
    revalidatePath(`/dashboard/${listId}`);
};

export const removeApplication = async (
    listId: string,
    applicationId: string,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;

    await deleteApplicationDb(session.user.id, applicationId);
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
};

export const removeApplications = async (
    listId: string,
    applicationIds: string[],
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || applicationIds.length === 0) return;

    await deleteApplicationsDb(session.user.id, applicationIds);
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
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
