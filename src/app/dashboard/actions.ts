"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import {
    createApplication as insertApplication,
    createList as insertList,
    deleteApplication as deleteApplicationDb,
    deleteApplications as deleteApplicationsDb,
    deleteList as deleteListDb,
    getApplicationExtras,
    saveApplicationDetailAndSteps as saveApplicationDetailDb,
    setApplicationsArrangement as setApplicationsArrangementDb,
    setApplicationsStatus as setApplicationsStatusDb,
    setListPinned,
    updateApplications as updateApplicationsDb,
    updateList as updateListDb,
} from "@/db/dashboard";
import { getUserSettings } from "@/db/settings";
import type {
    ApplicationExtras,
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
    acquireProviderRead,
    getCachedJobImport,
    putCachedJobImport,
} from "@/db/job-import";
import { recordMetrics } from "@/db/metrics";
import { POSTING_FALLBACK, record } from "@/lib/metrics";
import { withinBudget } from "@/db/rate-limit";
import {
    applicationQuota,
    applicationsAtEventCap,
    listQuota,
    statusEventQuota,
} from "@/db/quotas";
import {
    MAX_APPLICATION_BATCH,
    MAX_EVENTS_PER_APPLICATION,
    TOO_MANY_REQUESTS,
} from "@/lib/limits";
import {
    applicationCreateSchema,
    applicationDetailSchema,
    applicationIdSchema,
    applicationSchema,
    firstIssue,
    listCreateSchema,
    listUpdateSchema,
    stepEditsSchema,
    timeZoneSchema,
    type ActionResult,
} from "@/lib/validation";

const NOT_SIGNED_IN = "You are not signed in." as const;

// The table sends the rows it is showing, so a selection it cannot make sense
// of means the two have drifted apart rather than that the user did anything.
const INVALID_SELECTION = "Those applications are no longer there." as const;

// Everything below answers for one signed-in account, and every write it makes
// is counted against that account's budget. The two go together, so they are
// asked for together, before anything is read or parsed. The refusal is already
// an ActionResult, so an action that reports one can hand it straight back.
type Writer = { ok: true; userId: string } | { ok: false; error: string };

const writingUser = async (): Promise<Writer> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };
    if (!(await withinBudget(session.user.id, "write"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }
    return { ok: true, userId: session.user.id };
};

const validApplicationIds = (ids: string[]): boolean =>
    ids.length <= MAX_APPLICATION_BATCH &&
    ids.every((id) => applicationIdSchema.safeParse(id).success);

// Read when a row is opened rather than sent with the table. Returning null for
// an application that is gone or was never this user's lets the panel open on
// what the row already holds instead of refusing to open at all.
export const loadApplicationExtras = async (
    applicationId: string,
): Promise<ApplicationExtras | null> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return getApplicationExtras(session.user.id, applicationId);
};

export const createList = async (
    name: string,
    description: string | null,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = listCreateSchema.safeParse({ name, description });
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    const room = await listQuota(writer.userId);
    if (!room.ok) return room;

    await insertList(writer.userId, parsed.data.name, parsed.data.description);
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
        after(() => recordMetrics([record(POSTING_FALLBACK, "unsupported")]));
        return { status: "unsupported", posting: EMPTY_POSTING };
    }

    try {
        const cached = await getCachedJobImport(normalizedUrl);
        if (cached) {
            // Counted apart from the read the browser reports. That one measures
            // whether the feature worked; this measures how often the shared
            // cache spared a provider a request, which is the number that says
            // whether the app is a good guest.
            after(() => recordMetrics([record(POSTING_FALLBACK, "cache")]));
            return { status: "found", posting: cached };
        }

        const allowed = await acquireJobImportBudget(
            session.user.id,
            providerHost,
            serverImportRequestCost(normalizedUrl),
        );
        if (!allowed) {
            after(() =>
                recordMetrics([record(POSTING_FALLBACK, "rate-limited")]),
            );
            return { status: "rate-limited", posting: EMPTY_POSTING };
        }

        const posting = await scrapePosting(normalizedUrl, () =>
            acquireProviderRead(providerHost),
        );
        if (hasPostingSuggestion(posting)) {
            await putCachedJobImport(normalizedUrl, posting);
            after(() => recordMetrics([record(POSTING_FALLBACK, "fetched")]));
            return { status: "found", posting };
        }
        after(() => recordMetrics([record(POSTING_FALLBACK, "missed")]));
        return { status: "missed", posting };
    } catch {
        after(() => recordMetrics([record(POSTING_FALLBACK, "missed")]));
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
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    const parsed = applicationCreateSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    const room = await applicationQuota(writer.userId, listId, 1);
    if (!room.ok) return room;

    await insertApplication(
        writer.userId,
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
    const writer = await writingUser();
    if (!writer.ok) return writer;
    if (rows.length > MAX_APPLICATION_BATCH) {
        return {
            ok: false,
            error: `You can edit ${MAX_APPLICATION_BATCH} applications at a time.`,
        };
    }

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    const parsedRows = [];
    for (const row of rows) {
        if (!applicationIdSchema.safeParse(row.id).success) {
            return { ok: false, error: "Choose a valid application." };
        }
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

    const { defaultCurrency } = await getUserSettings(writer.userId);
    await updateApplicationsDb(
        writer.userId,
        parsedRows,
        parsedTimeZone.data,
        defaultCurrency,
    );
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
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
    const writer = await writingUser();
    if (!writer.ok) return writer;

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

    // Dropped steps make room, so only what the save adds beyond them counts.
    const recording =
        parsedSteps.data.added.length - parsedSteps.data.removed.length;
    if (recording > 0) {
        const room = await statusEventQuota(
            writer.userId,
            applicationId,
            recording,
        );
        if (!room.ok) return room;
    }

    await saveApplicationDetailDb(
        writer.userId,
        applicationId,
        parsed.data,
        parsedSteps.data,
        parsedTimeZone.data,
    );
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const setApplicationsStatus = async (
    listId: string,
    applicationIds: string[],
    status: ApplicationStatus,
    timeZone: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;
    if (applicationIds.length === 0 || !validApplicationIds(applicationIds)) {
        return { ok: false, error: INVALID_SELECTION };
    }

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    // An application that has recorded as many moves as it keeps is left as it
    // is, status and history together, rather than moving with no record of it.
    const capped = await applicationsAtEventCap(applicationIds);
    const recordable =
        capped.size === 0
            ? applicationIds
            : applicationIds.filter((id) => !capped.has(id));
    if (recordable.length === 0) {
        return {
            ok: false,
            error: `An application keeps ${MAX_EVENTS_PER_APPLICATION} status changes, and these have recorded them all.`,
        };
    }

    await setApplicationsStatusDb(
        writer.userId,
        recordable,
        status,
        parsedTimeZone.data,
    );
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const setApplicationsArrangement = async (
    listId: string,
    applicationIds: string[],
    arrangement: Arrangement | null,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;
    if (applicationIds.length === 0 || !validApplicationIds(applicationIds)) {
        return { ok: false, error: INVALID_SELECTION };
    }

    await setApplicationsArrangementDb(
        writer.userId,
        applicationIds,
        arrangement,
    );
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const removeApplication = async (
    listId: string,
    applicationId: string,
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    await deleteApplicationDb(writer.userId, applicationId);
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const removeApplications = async (
    listId: string,
    applicationIds: string[],
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;
    if (applicationIds.length === 0 || !validApplicationIds(applicationIds)) {
        return { ok: false, error: INVALID_SELECTION };
    }

    await deleteApplicationsDb(writer.userId, applicationIds);
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const updateList = async (
    listId: string,
    input: { name: string; description: string | null; status: ListStatus },
): Promise<ActionResult> => {
    const writer = await writingUser();
    if (!writer.ok) return writer;

    const parsed = listUpdateSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: firstIssue(parsed.error) };
    }

    await updateListDb(writer.userId, listId, {
        name: parsed.data.name,
        description: parsed.data.description,
        status: parsed.data.status,
    });
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true };
};

export const deleteList = async (listId: string): Promise<void> => {
    const writer = await writingUser();
    if (!writer.ok) return;

    await deleteListDb(writer.userId, listId);
    revalidatePath("/dashboard");
};

export const togglePin = async (
    listId: string,
    pinned: boolean,
): Promise<void> => {
    const writer = await writingUser();
    if (!writer.ok) return;

    await setListPinned(writer.userId, listId, pinned);
    revalidatePath("/dashboard");
};
