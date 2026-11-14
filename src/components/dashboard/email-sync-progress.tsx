"use client";

import { useEffect, useState } from "react";
import type { EmailSyncProgress } from "@/lib/email/progress";
import type { SyncResult } from "@/lib/email/sync-result";
import { MAX_EMAILS_PER_SYNC } from "@/lib/limits";

export type SyncDisplay = {
    progress: EmailSyncProgress;
    startedAt: number;
    updatedAt: number;
    endedAt?: number;
    result?: SyncResult;
};

type Phase = "finding" | "checking" | "finishing" | "complete" | "stopped";

type SyncSummary = {
    phase: Phase;
    title: string;
    // Beside the title while the sync runs: time left, or a stall notice.
    status: string | null;
    tally: string | null;
    found: string | null;
    hasFound: boolean;
    // Only once the run ends: what is left to do, or why it stopped.
    note: string | null;
    // Share of the sync's emails fully checked, 0 to 1.
    checked: number;
};

const number = (value: number) => value.toLocaleString("en-US");

const emails = (count: number) =>
    `${number(count)} email${count === 1 ? "" : "s"}`;

const updates = (count: number) =>
    `${number(count)} update${count === 1 ? "" : "s"}`;

const timeLeft = (ms: number) => {
    const seconds = Math.max(5, Math.ceil(ms / 5_000) * 5);
    return seconds < 60
        ? `About ${seconds}s left`
        : `About ${Math.ceil(seconds / 60)}m left`;
};

const followUp = (result: Extract<SyncResult, { ok: true }>) => {
    if (result.remaining > 0) {
        return `${emails(result.remaining)} left to check. Sync again to continue.`;
    }
    if (result.initialScanLimited) {
        return `The first sync checks your ${number(MAX_EMAILS_PER_SYNC)} most recent emails.`;
    }
    if (result.hasMore)
        return "More emails left to check. Sync again to continue.";
    return null;
};

const summarize = (run: SyncDisplay, now: number): SyncSummary => {
    const { progress: p, result } = run;
    const total = p.total;
    const sinceUpdate = Math.max(0, now - run.updatedAt);
    const stalled =
        !result && sinceUpdate > Math.max(30_000, (p.remainingMs ?? 0) * 1.5);
    const phase: Phase = result
        ? result.ok
            ? "complete"
            : "stopped"
        : total === null
          ? "finding"
          : p.stage === "finishing"
            ? "finishing"
            : "checking";

    const title = {
        finding: "Looking for new emails",
        checking: "Checking emails",
        finishing: "Finishing up",
        complete: "Sync complete",
        stopped: "Sync stopped",
    }[phase];

    const status = result
        ? null
        : stalled
          ? "Taking longer than expected"
          : phase !== "checking"
            ? null
            : p.remainingMs === null
              ? "Estimating time"
              : timeLeft(p.remainingMs - sinceUpdate);

    const tally =
        total === null
            ? null
            : total === 0
              ? "No new emails"
              : result?.ok
                ? `${emails(total)} checked`
                : `${number(p.checked)} of ${emails(total)} checked`;

    const foundCount = result?.ok ? result.found : p.found;
    const found =
        foundCount > 0
            ? `${updates(foundCount)} found`
            : result?.ok && total !== 0
              ? "No updates found"
              : null;

    const note = !result
        ? null
        : result.ok
          ? followUp(result)
          : `${result.message}${p.checked > 0 ? " Progress is saved." : ""}`;

    // Emails fully checked, either set aside after reading or reviewed. Reading
    // runs ahead of review, so the bar can trail it near the end. 100% means
    // every email is checked; the title says when the sync itself is done.
    const checked =
        total === null ? 0 : total === 0 ? 1 : Math.min(1, p.checked / total);

    return {
        phase,
        title,
        status,
        tally,
        found,
        hasFound: foundCount > 0,
        note,
        checked,
    };
};

export const EmailSyncProgressPanel = ({ run }: { run: SyncDisplay }) => {
    const [now, setNow] = useState(run.startedAt);
    useEffect(() => {
        if (run.endedAt !== undefined) return;
        const timer = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [run.startedAt, run.endedAt]);

    const summary = summarize(run, now);
    const finding = summary.phase === "finding";

    return (
        <section
            aria-label="Sync progress"
            className="border-b border-hairline px-4 py-4"
        >
            <div className="flex items-baseline justify-between gap-3">
                <p
                    role="status"
                    className="truncate text-sm font-medium text-ink"
                >
                    {summary.title}
                </p>
                {summary.status && (
                    <span className="shrink-0 text-xs tabular-nums text-sub">
                        {summary.status}
                    </span>
                )}
            </div>
            <div
                role="progressbar"
                aria-label="Inbox sync progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                    finding ? undefined : Math.floor(summary.checked * 100)
                }
                aria-valuetext={summary.tally ?? summary.title}
                className="relative mt-3 h-1 overflow-hidden bg-hairline"
            >
                {finding ? (
                    <div className="sync-sweep absolute inset-y-0 w-1/3 bg-linear-to-r from-transparent via-accent to-transparent" />
                ) : (
                    // One element per run, so a new run resets the fill instead
                    // of sliding it back from the last run's end. Each update
                    // responds promptly, then settles gently without a hard
                    // stop or bounce.
                    <div
                        key={run.startedAt}
                        className={`absolute inset-0 origin-left transition-transform ease-[cubic-bezier(0.2,0.65,0.3,1)] motion-reduce:transition-none ${run.result ? "duration-500" : "duration-2000"} ${summary.phase === "stopped" ? "bg-rose" : "bg-accent"}`}
                        style={{ transform: `scaleX(${summary.checked})` }}
                    />
                )}
            </div>
            {/* One line in every phase, so the rows below never move. */}
            <div className="mt-2 flex h-4 items-baseline justify-between gap-3 text-xs tabular-nums">
                <span className="truncate text-sub">{summary.tally}</span>
                {summary.found && (
                    <span
                        className={`shrink-0 ${summary.hasFound ? "font-medium text-accent-deep" : "text-sub"}`}
                    >
                        {summary.found}
                    </span>
                )}
            </div>
            {summary.note && (
                <p
                    role="status"
                    className="mt-3 text-pretty text-xs leading-5 text-sub"
                >
                    {summary.note}
                </p>
            )}
        </section>
    );
};
