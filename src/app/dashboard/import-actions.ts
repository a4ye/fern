"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { importApplications } from "@/db/dashboard";
import { readSheet, type SheetResult } from "@/lib/import/sheet";
import type { ImportDraft } from "@/lib/import/rows";
import { importRowSchema, timeZoneSchema, firstIssue } from "@/lib/validation";

const NOT_SIGNED_IN = "You are not signed in." as const;

// The upload is read into a grid and thrown away inside this call. Nothing about
// the file is stored, and the rows travel back to the browser, where the mapping
// steps run, rather than being held between calls.
export const readImportFile = async (file: File): Promise<SheetResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    return readSheet(file.name, await file.arrayBuffer());
};

export type ImportResult =
    { ok: true; added: number } | { ok: false; error: string };

// The rows arrive already mapped and already sorted into what the user chose to
// keep, so nothing here decides what an import means. Every row is validated
// again regardless: the browser is where the choosing happened, not where the
// rules live.
export const commitImport = async (
    listId: string,
    drafts: ImportDraft[],
    timeZone: string,
): Promise<ImportResult> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: NOT_SIGNED_IN };

    if (drafts.length === 0) {
        return { ok: false, error: "There is nothing to import." };
    }

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    const rows: ImportDraft[] = [];
    for (const draft of drafts) {
        const parsed = importRowSchema.safeParse(draft);
        if (!parsed.success) {
            return { ok: false, error: firstIssue(parsed.error) };
        }
        rows.push(parsed.data);
    }

    const added = await importApplications(
        session.user.id,
        listId,
        rows,
        parsedTimeZone.data,
    );

    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true, added };
};
