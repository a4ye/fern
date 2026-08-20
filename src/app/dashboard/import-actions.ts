"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { importApplications } from "@/db/dashboard";
import { getUserSettings } from "@/db/settings";
import { recordMetrics } from "@/db/metrics";
import { withinBudget } from "@/db/rate-limit";
import { applicationQuota } from "@/db/quotas";
import { SHEET_IMPORT, record } from "@/lib/metrics";
import {
    FILE_TOO_LARGE,
    MAX_IMPORT_BYTES,
    MAX_IMPORT_ROWS,
    TOO_MANY_REQUESTS,
} from "@/lib/limits";
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

    // The size the upload declares, before `arrayBuffer` copies it. The browser
    // checks this too, and a caller that skipped the browser is exactly who this
    // is here for. `readSheet` measures the bytes it is handed either way.
    if (file.size > MAX_IMPORT_BYTES) {
        return { ok: false, error: FILE_TOO_LARGE };
    }
    if (!(await withinBudget(session.user.id, "import"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }

    const sheet = await readSheet(file.name, await file.arrayBuffer());
    // Counted apart from the commit below, since the gap between the two is the
    // interesting part: a file read and then abandoned is a mapping step that
    // did not convince anyone.
    after(() =>
        recordMetrics([
            record(SHEET_IMPORT, sheet.ok ? "read" : "unreadable", {
                total: sheet.ok ? sheet.sheet.rows.length : 0,
            }),
        ]),
    );
    return sheet;
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
    if (drafts.length > MAX_IMPORT_ROWS) {
        return {
            ok: false,
            error: `You can import ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time.`,
        };
    }
    if (!(await withinBudget(session.user.id, "import"))) {
        return { ok: false, error: TOO_MANY_REQUESTS };
    }

    const parsedTimeZone = timeZoneSchema.safeParse(timeZone);
    if (!parsedTimeZone.success) {
        return { ok: false, error: firstIssue(parsedTimeZone.error) };
    }

    // Asked before the rows are validated one by one, so a file with no room to
    // land is answered without reading all 10,000 of them through the schema.
    const room = await applicationQuota(session.user.id, listId, drafts.length);
    if (!room.ok) return room;

    const rows: ImportDraft[] = [];
    for (const draft of drafts) {
        const parsed = importRowSchema.safeParse(draft);
        if (!parsed.success) {
            return { ok: false, error: firstIssue(parsed.error) };
        }
        rows.push(parsed.data);
    }

    const { defaultCurrency } = await getUserSettings(session.user.id);
    const added = await importApplications(
        session.user.id,
        listId,
        rows,
        parsedTimeZone.data,
        defaultCurrency,
    );

    after(() =>
        recordMetrics([record(SHEET_IMPORT, "committed", { total: added })]),
    );
    revalidatePath(`/dashboard/${listId}`);
    revalidatePath("/dashboard");
    return { ok: true, added };
};
