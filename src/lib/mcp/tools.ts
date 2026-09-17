import { z } from "zod";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import {
    applicationKey,
    createList,
    deleteApplications,
    deleteList,
    findDuplicateApplications,
    getApplication,
    getApplicationExtras,
    getList,
    getListDetail,
    getListInsights,
    getListsForUser,
    importApplications,
    saveApplicationDetailPatch,
    setApplicationsArrangement,
    setApplicationsStatus,
    setListPinned,
    updateList,
} from "@/db/dashboard";
import { getUserSettings, saveUserSettings } from "@/db/settings";
import {
    getListHistory,
    restoreHistoryVersion,
    undoHistoryAction,
} from "@/db/history";
import {
    applicationQuota,
    applicationsAtEventCap,
    listQuota,
    statusEventQuota,
} from "@/db/quotas";
import { withinBudget } from "@/db/rate-limit";
import { MAX_APPLICATION_BATCH, TOO_MANY_REQUESTS } from "@/lib/limits";
import { READ_ONLY_TOKEN, allowsWrite } from "@/lib/mcp/scopes";
import {
    APPLICATION_STATUSES,
    ARRANGEMENTS,
    LIST_SORTS,
} from "@/components/dashboard/data";
import {
    applicationIdSchema,
    applicationPatch,
    currencySchema,
    firstIssue,
    importRowSchema,
    listCreateSchema,
    listStatusSchema,
    rowIdSchema,
    timeZoneSchema,
    type ApplicationDetailInput,
} from "@/lib/validation";

// What a tool sends back. Everything is JSON in a text block rather than a
// structured output schema: the caller is a model that reads the text either
// way, and one shape for every tool is less to keep in step than one per tool.
type ToolReply = {
    content: { type: "text"; text: string }[];
    isError?: boolean;
};

const reply = (data: unknown): ToolReply => ({
    content: [{ type: "text", text: JSON.stringify(data) }],
});

const refuse = (error: string): ToolReply => ({
    content: [{ type: "text", text: JSON.stringify({ error }) }],
    isError: true,
});

// The account the token was issued for. withMcpAuth has already rejected a
// request without one, so this only narrows what the transport types as
// optional.
const accountOf = (context: ServerContext): string => {
    const extra = context.http?.authInfo?.extra;
    const userId =
        extra && typeof extra === "object" && "userId" in extra
            ? (extra as { userId: unknown }).userId
            : null;
    if (typeof userId !== "string") {
        throw new Error("This token is not linked to an account.");
    }
    return userId;
};

// What the token was issued for. Absent on one predating the scopes, which
// `allowsWrite` reads as the full grant such a token was actually given.
const scopesOf = (context: ServerContext): string[] =>
    context.http?.authInfo?.scopes ?? [];

// What stops a write, or null when nothing does. Every write tool below starts
// here, which is what keeps the two checks from drifting apart: one added later
// gets both by asking the same question, and neither can be forgotten on its
// own.
//
// The scope is read first because it is a fact already on the token and costs
// nothing, while taking the budget is itself a write. A connection that may not
// write at all should not spend one to be told so.
//
// The budget is the same one the browser spends, so an agent left looping is
// stopped by the ceiling already set for the account rather than by one written
// for this entry point.
const writeRefusal = async (
    context: ServerContext,
    userId: string,
): Promise<string | null> => {
    if (!allowsWrite(scopesOf(context))) return READ_ONLY_TOKEN;
    if (!(await withinBudget(userId, "write"))) return TOO_MANY_REQUESTS;
    return null;
};

const NOT_FOUND = "That is no longer available.";

// Status moves are recorded as history, and an application that has recorded
// every step it keeps cannot record another. The browser greys these out in the
// selection; here they are named in the reply so the caller can say which rows
// did not move and why.
const statusTargets = async (
    applicationIds: string[],
): Promise<{ moved: string[]; atCap: string[] }> => {
    const capped = await applicationsAtEventCap(applicationIds);
    return {
        moved: applicationIds.filter((id) => !capped.has(id)),
        atCap: applicationIds.filter((id) => capped.has(id)),
    };
};

const idsSchema = z
    .array(applicationIdSchema)
    .min(1, "Name at least one application.")
    .max(
        MAX_APPLICATION_BATCH,
        `One call can change ${MAX_APPLICATION_BATCH.toLocaleString()} applications.`,
    );

const listIdSchema = rowIdSchema;

// A day is read against the caller's clock in several places, so it travels with
// the call rather than being assumed. UTC is the honest default for a caller
// that does not say.
const timeZoneArg = timeZoneSchema.default("UTC");

export const registerFernTools = (server: McpServer): void => {
    server.registerTool(
        "list_lists",
        {
            title: "List job lists",
            description:
                "Every list on the account, with its status, whether it is pinned, and how many applications it holds. Call this first to find the list id other tools need.",
            inputSchema: z.object({
                search: z.string().max(100).default(""),
                sort: z
                    .enum(LIST_SORTS.map((option) => option.key))
                    .default("recent"),
                limit: z.number().int().min(1).max(100).default(50),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ search, sort, limit }, context) => {
            const page = await getListsForUser(accountOf(context), {
                search,
                sort,
                page: 1,
                pageSize: limit,
            });
            return reply({ lists: page.lists, total: page.total });
        },
    );

    server.registerTool(
        "get_list",
        {
            title: "Read a list",
            description:
                "One list and the applications in it. Filter by status or search company and role text to narrow what comes back.",
            inputSchema: z.object({
                listId: listIdSchema,
                status: z.enum(APPLICATION_STATUSES).optional(),
                search: z.string().max(100).optional(),
                limit: z.number().int().min(1).max(2000).default(200),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ listId, status, search, limit }, context) => {
            const detail = await getListDetail(accountOf(context), listId);
            if (!detail) return refuse(NOT_FOUND);

            const needle = search?.trim().toLowerCase();
            const matching = detail.applications.filter(
                (application) =>
                    (!status || application.status === status) &&
                    (!needle ||
                        `${application.company} ${application.role ?? ""}`
                            .toLowerCase()
                            .includes(needle)),
            );

            return reply({
                id: detail.id,
                name: detail.name,
                description: detail.description,
                status: detail.status,
                stats: detail.stats,
                matched: matching.length,
                applications: matching.slice(0, limit),
            });
        },
    );

    server.registerTool(
        "get_application",
        {
            title: "Read an application",
            description:
                "Every stored field of one application, including notes and the status steps it has recorded.",
            inputSchema: z.object({ applicationId: applicationIdSchema }),
            annotations: { readOnlyHint: true },
        },
        async ({ applicationId }, context) => {
            const userId = accountOf(context);
            const [application, extras] = await Promise.all([
                getApplication(userId, applicationId),
                getApplicationExtras(userId, applicationId),
            ]);
            if (!application) return refuse(NOT_FOUND);
            return reply({ ...application, history: extras?.history ?? [] });
        },
    );

    server.registerTool(
        "get_list_insights",
        {
            title: "Read list insights",
            description:
                "The funnel, the volume over time, and where the applications went, as numbers rather than as a chart.",
            inputSchema: z.object({ listId: listIdSchema }),
            annotations: { readOnlyHint: true },
        },
        async ({ listId }, context) => {
            const insights = await getListInsights(accountOf(context), listId);
            return insights ? reply(insights) : refuse(NOT_FOUND);
        },
    );

    server.registerTool(
        "get_settings",
        {
            title: "Read account settings",
            description:
                "The account's default currency and its link and title preferences.",
            inputSchema: z.object({}),
            annotations: { readOnlyHint: true },
        },
        async (_args, context) =>
            reply(await getUserSettings(accountOf(context))),
    );

    server.registerTool(
        "add_applications",
        {
            title: "Add applications",
            description:
                "Add one or more applications to a list. Pay is free text and is parsed, so '80k-90k CAD/yr' is understood. Rows already in the list are skipped and named in the reply unless allowDuplicates is set.",
            inputSchema: z.object({
                listId: listIdSchema,
                applications: z
                    .array(importRowSchema)
                    .min(1, "Name at least one application.")
                    .max(MAX_APPLICATION_BATCH),
                allowDuplicates: z.boolean().default(false),
                timeZone: timeZoneArg,
            }),
        },
        async (
            { listId, applications, allowDuplicates, timeZone },
            context,
        ) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);

            let rows = applications;
            const skipped: {
                company: string;
                role: string | null;
                existingId: string | null;
            }[] = [];

            if (!allowDuplicates) {
                const existing = await findDuplicateApplications(
                    userId,
                    listId,
                    applications.map((row) => ({
                        company: row.company,
                        role: row.role,
                    })),
                );
                const held = new Map(
                    existing.map((match) => [match.key, match.existingId]),
                );
                const seen = new Set<string>();
                rows = applications.filter((row) => {
                    const key = applicationKey(row.company, row.role);
                    const clash = held.get(key) ?? null;
                    if (clash || seen.has(key)) {
                        skipped.push({
                            company: row.company,
                            role: row.role,
                            existingId: clash,
                        });
                        return false;
                    }
                    seen.add(key);
                    return true;
                });
            }

            if (rows.length === 0) {
                return reply({ added: 0, skipped });
            }

            const room = await applicationQuota(userId, listId, rows.length);
            if (!room.ok) return refuse(room.error);

            const { defaultCurrency } = await getUserSettings(userId);
            const added = await importApplications(
                userId,
                listId,
                rows,
                timeZone,
                defaultCurrency,
            );
            return reply({ added, skipped });
        },
    );

    server.registerTool(
        "update_application",
        {
            title: "Edit an application",
            description:
                "Change named fields of one application and leave the rest as they are. Send a field as null to clear it. Status is not among these: use set_status, which records the move.",
            inputSchema: z.object({
                applicationId: applicationIdSchema,
                changes: z
                    .record(z.string(), z.unknown())
                    .describe(
                        "Any of company, role, location, arrangement, appliedAt, url, payMin, payMax, payCurrency, payPeriod, bonus, payNote, notes.",
                    ),
            }),
        },
        async ({ applicationId, changes }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);

            const parsed = applicationPatch(changes);
            if (!parsed.ok) return refuse(parsed.error);
            if (Object.keys(parsed.patch).length === 0) {
                return refuse("Name at least one field to change.");
            }

            const result = await saveApplicationDetailPatch(
                userId,
                applicationId,
                (stored) => {
                    const merged: ApplicationDetailInput = {
                        ...stored,
                        ...parsed.patch,
                    };
                    if (
                        merged.payMin !== null &&
                        merged.payMax !== null &&
                        Number(merged.payMax) < Number(merged.payMin)
                    ) {
                        return {
                            ok: false,
                            error: "Maximum pay cannot be less than the minimum.",
                        };
                    }
                    return { ok: true, detail: merged };
                },
            );

            if (result.ok) return reply({ updated: applicationId });
            return refuse(
                result.reason === "missing" ? NOT_FOUND : result.error,
            );
        },
    );

    server.registerTool(
        "set_status",
        {
            title: "Move applications to a status",
            description:
                "Set the status of one or more applications. Each move is recorded as a step in the application's history, so setting the status it already holds logs another round.",
            inputSchema: z.object({
                applicationIds: idsSchema,
                status: z.enum(APPLICATION_STATUSES),
                timeZone: timeZoneArg,
            }),
        },
        async ({ applicationIds, status, timeZone }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);

            if (applicationIds.length === 1) {
                const room = await statusEventQuota(
                    userId,
                    applicationIds[0],
                    1,
                );
                if (!room.ok) return refuse(room.error);
            }

            const { moved, atCap } = await statusTargets(applicationIds);
            if (moved.length > 0) {
                await setApplicationsStatus(userId, moved, status, timeZone);
            }
            return reply({ moved: moved.length, atCap });
        },
    );

    server.registerTool(
        "set_arrangement",
        {
            title: "Set where applications are worked",
            description:
                "Set remote, hybrid, or onsite across a selection, or send null to clear it.",
            inputSchema: z.object({
                applicationIds: idsSchema,
                arrangement: z.enum(ARRANGEMENTS).nullable(),
            }),
        },
        async ({ applicationIds, arrangement }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);
            await setApplicationsArrangement(
                userId,
                applicationIds,
                arrangement,
            );
            return reply({ updated: applicationIds.length });
        },
    );

    server.registerTool(
        "delete_applications",
        {
            title: "Delete applications",
            description:
                "Remove applications from their list. This is recorded in the list's history and can be undone with undo_action.",
            inputSchema: z.object({ applicationIds: idsSchema }),
            annotations: { destructiveHint: true },
        },
        async ({ applicationIds }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);
            await deleteApplications(userId, applicationIds);
            return reply({ deleted: applicationIds.length });
        },
    );

    server.registerTool(
        "create_list",
        {
            title: "Create a list",
            description: "Start a new list of applications.",
            inputSchema: z.object({
                name: z.string(),
                description: z.string().nullish(),
            }),
        },
        async (input, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);

            const parsed = listCreateSchema.safeParse(input);
            if (!parsed.success) return refuse(firstIssue(parsed.error));

            const room = await listQuota(userId);
            if (!room.ok) return refuse(room.error);

            return reply(
                await createList(
                    userId,
                    parsed.data.name,
                    parsed.data.description,
                ),
            );
        },
    );

    server.registerTool(
        "update_list",
        {
            title: "Edit a list",
            description:
                "Rename a list, change its description or status, or pin it. Name only what is changing; the rest of the list stays as it is.",
            inputSchema: z.object({
                listId: listIdSchema,
                name: z.string().optional(),
                description: z.string().nullish(),
                status: listStatusSchema.optional(),
                pinned: z.boolean().optional(),
            }),
        },
        async ({ listId, pinned, ...changes }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);

            const stored = await getList(userId, listId);
            if (!stored) return refuse(NOT_FOUND);

            const parsed = listCreateSchema
                .extend({ status: listStatusSchema })
                .safeParse({
                    name: changes.name ?? stored.name,
                    description:
                        changes.description === undefined
                            ? stored.description
                            : changes.description,
                    status: changes.status ?? stored.status,
                });
            if (!parsed.success) return refuse(firstIssue(parsed.error));

            const changed = await updateList(userId, listId, parsed.data);
            if (!changed) return refuse(NOT_FOUND);
            if (pinned !== undefined) {
                await setListPinned(userId, listId, pinned);
            }
            return reply({ updated: listId });
        },
    );

    server.registerTool(
        "delete_list",
        {
            title: "Delete a list",
            description:
                "Delete a list and every application in it. This is not recoverable from the list's own history.",
            inputSchema: z.object({ listId: listIdSchema }),
            annotations: { destructiveHint: true },
        },
        async ({ listId }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);
            await deleteList(userId, listId);
            return reply({ deleted: listId });
        },
    );

    server.registerTool(
        "update_settings",
        {
            title: "Change account settings",
            description:
                "Set the default currency new pay figures are read in, and whether pasted links are cleaned, employer links are preferred, and role titles are tidied.",
            inputSchema: z.object({
                defaultCurrency: currencySchema.optional(),
                cleanLinks: z.boolean().optional(),
                employerLinks: z.boolean().optional(),
                tidyTitles: z.boolean().optional(),
            }),
        },
        async (changes, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);

            const current = await getUserSettings(userId);
            const merged = {
                ...current,
                ...Object.fromEntries(
                    Object.entries(changes).filter(
                        ([, value]) => value !== undefined,
                    ),
                ),
            };
            await saveUserSettings(userId, merged);
            return reply(merged);
        },
    );

    server.registerTool(
        "list_history",
        {
            title: "Read a list's history",
            description:
                "What has been done to a list, most recent first, and which entries can be undone or restored.",
            inputSchema: z.object({
                listId: listIdSchema,
                before: z
                    .string()
                    .regex(/^\d{1,19}$/)
                    .optional(),
                limit: z.number().int().min(1).max(50).default(20),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ listId, before, limit }, context) =>
            reply(
                await getListHistory(
                    accountOf(context),
                    listId,
                    before ?? null,
                    limit,
                ),
            ),
    );

    server.registerTool(
        "undo_action",
        {
            title: "Undo a change",
            description:
                "Reverse one entry from a list's history. Use list_history to find an entry whose canUndo is true.",
            inputSchema: z.object({
                listId: listIdSchema,
                actionId: z.string().regex(/^\d{1,19}$/),
            }),
        },
        async ({ listId, actionId }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);
            const result = await undoHistoryAction(userId, listId, actionId);
            return result.ok
                ? reply({ undone: actionId })
                : refuse(result.error);
        },
    );

    server.registerTool(
        "restore_version",
        {
            title: "Restore a list to an earlier state",
            description:
                "Put a list back the way it was at one entry in its history. Use list_history to find an entry whose canRestore is true.",
            inputSchema: z.object({
                listId: listIdSchema,
                actionId: z.string().regex(/^\d{1,19}$/),
            }),
            annotations: { destructiveHint: true },
        },
        async ({ listId, actionId }, context) => {
            const userId = accountOf(context);
            const denied = await writeRefusal(context, userId);
            if (denied) return refuse(denied);
            const result = await restoreHistoryVersion(
                userId,
                listId,
                actionId,
            );
            return result.ok
                ? reply({ restored: actionId })
                : refuse(result.error);
        },
    );
};
