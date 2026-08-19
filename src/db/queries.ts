// Barrel over the sqlc-generated query modules (one per file in db/queries).
// Import these through `@/db/queries` so call sites stay agnostic to how the
// SQL is split across files.
export * from "@/db/gen/lists_sql";
export * from "@/db/gen/applications_sql";
export * from "@/db/gen/events_sql";
export * from "@/db/gen/email_sql";
export * from "@/db/gen/quotas_sql";
