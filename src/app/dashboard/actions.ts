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
    saveApplicationDetailAndSteps as saveApplicationDetailDb,
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
import {
    EMPTY_POSTING,
    normalizeImportUrl,
    scrapePosting,
    serverImportHost,
    serverImportRequestCost,
} from "@/lib/job-scrape";
import {
    hasPostingSuggestion,
    type ScrapedPosting,
} from "@/lib/job-import/shared";
import {
    acquireJobImportBudget,
    getCachedJobImport,
    putCachedJobImport,
} from "@/db/job-import";
import {
    applicationCreateSchema,
    applicationDetailSchema,
    applicationSchema,
    firstIssue,
    listCreateSchema,
    listUpdateSchema,
    stepEditsSchema,
    timeZoneSchema,
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

export type JobImportFallbackResult = {
    status: "found" | "missed" | "unsupported" | "rate-limited";
    posting: ScrapedPosting;
};

export const suggestFromUrl = async (
    url: string,
): Promise<JobImportFallbackResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { status: "missed", posting: EMPTY_POSTING };

    const normalizedUrl = normalizeImportUrl(url.trim());
    const providerHost = serverImportHost(url.trim());
    if (!normalizedUrl || !providerHost) {
        return { status: "unsupported", posting: EMPTY_POSTING };
    }

    try {
        const cached = await getCachedJobImport(normalizedUrl);
        if (cached) return { status: "found", posting: cached };

        const allowed = await acquireJobImportBudget(
            session.user.id,
            providerHost,
            serverImportRequestCost(normalizedUrl),
        );
        if (!allowed) {
            return { status: "rate-limited", posting: EMPTY_POSTING };
        }

        const posting = await scrapePosting(normalizedUrl);
        if (hasPostingSuggestion(posting)) {
            await putCachedJobImport(normalizedUrl, posting);
            return { status: "found", posting };
        }
        return { status: "missed", posting };
    } catch {
        return { status: "missed", posting: EMPTY_POSTING };
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

// The create form writes every column the detail panel does, plus the status
// the application starts at.
export type NewApplicationDraft = ApplicationDetailDraft & {
    status: ApplicationStatus;
};

export const addApplication = async (
    listId: string,
    input: NewApplicationDraft,
    timeZone: string,
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    const parsed = applicationCreateSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    await insertApplication(
        session.user.id,
        listId,
        parsed.data,
        parsedTimeZone.data,
    );
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
    timeZone: string,
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

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

    await updateApplicationsDb(
        session.user.id,
        parsedRows,
        parsedTimeZone.data,
    );
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
    timeZone: string,
): Promise<ActionResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    const parsed = applicationDetailSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    const parsedSteps = stepEditsSchema.safeParse(steps);
    if (!parsedSteps.success) {
        return { ok: false, error: firstIssue(parsedSteps.error) };
    }

    await saveApplicationDetailDb(
        session.user.id,
        applicationId,
        parsed.data,
        parsedSteps.data,
        parsedTimeZone.data,
    );
    revalidatePath(`/dashboard/${listId}`);
    return { ok: true };
};

export const setApplicationsStatus = async (
    listId: string,
    applicationIds: string[],
    status: ApplicationStatus,
    timeZone: string,
): Promise<void> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || applicationIds.length === 0) return;

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) return;

    await setApplicationsStatusDb(
        session.user.id,
        applicationIds,
        status,
        parsedTimeZone.data,
    );
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
