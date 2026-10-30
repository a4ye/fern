"use client";

import { useEffect, useState } from "react";
import type { EmailSyncProgress } from "@/lib/email/progress";
import type { SyncResult } from "@/lib/email/sync-result";
import { emailSyncSuccessMessage } from "@/lib/email/copy";

export type SyncDisplay = {
    progress: EmailSyncProgress;
    startedAt: number;
    updatedAt: number;
    endedAt?: number;
    result?: SyncResult;
};

const duration = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1_000));
    return seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const remainingTime = (ms: number) => {
    const seconds = Math.max(5, Math.ceil(ms / 5_000) * 5);
    return seconds < 60
        ? `About ${seconds}s remaining`
        : `About ${Math.ceil(seconds / 60)}m remaining`;
};

export const EmailSyncProgressPanel = ({ run }: { run: SyncDisplay }) => {
    const [now, setNow] = useState(run.startedAt);
    useEffect(() => {
        if (run.endedAt !== undefined) return;
        const timer = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [run.startedAt, run.endedAt]);

    const { progress: p, result } = run;
    const active = !result;
    const complete = result?.ok === true;
    const discovering = p.total === null;
    const readDone = !discovering && p.read === p.total;
    const reviewDone = readDone && p.reviewed === p.relevant;
    const elapsed = Math.max(0, (run.endedAt ?? now) - run.startedAt);
    const sinceUpdate = Math.max(0, now - run.updatedAt);
    const stalled =
        active && sinceUpdate > Math.max(30_000, (p.remainingMs ?? 0) * 1.5);
    const title = result
        ? complete
            ? "Sync complete"
            : "Sync interrupted"
        : p.stage === "discovering"
          ? "Finding new emails"
          : p.stage === "finishing"
            ? "Finishing sync"
            : !readDone
              ? p.activeReviews > 0
                  ? "Reading and reviewing emails"
                  : "Reading emails"
              : "Reviewing relevant emails";
    // The track covers the whole sync, including discovery and finalization.
    // Reserve a small lead-in so discovering the total never sends it backward.
    // Email counts below remain exact; 100% requires the server's final result.
    const percent = complete
        ? 100
        : discovering
          ? 4
          : p.stage === "finishing"
            ? 98
            : 8 + 90 * Math.min(1, p.total ? p.checked / p.total : 0);
    const stages = [
        {
            label: "Find emails",
            done: !discovering,
            active: discovering,
            detail: discovering
                ? "Looking for new mail"
                : `${p.total} in this sync`,
        },
        {
            label: "Read emails",
            done: readDone,
            active: !discovering && !readDone,
            detail: discovering ? "Waiting" : `${p.read} / ${p.total}`,
        },
        {
            label: "Review relevant emails",
            done: reviewDone,
            active: p.activeReviews > 0,
            detail: discovering
                ? "Waiting"
                : `${p.reviewed} / ${p.relevant}${!readDone ? " so far" : ""}`,
        },
        {
            label: "Finish sync",
            done: complete,
            active: p.stage === "finishing",
            detail: complete
                ? "Done"
                : p.stage === "finishing"
                  ? "Finishing up"
                  : "Waiting",
        },
    ];

    return (
        <section
            aria-label="Sync progress"
            className="border-b border-hairline px-4 py-4"
        >
            <p role="status" className="text-sm font-medium text-ink">
                {title}
            </p>
            <div
                role="progressbar"
                aria-label="Inbox sync progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                    discovering && !complete ? undefined : Math.floor(percent)
                }
                aria-valuetext={
                    discovering
                        ? title
                        : `${p.checked} of ${p.total} emails checked. ${title}.`
                }
                className="mt-3 h-1 overflow-hidden bg-hairline"
            >
                {/* Keep the same element across stages. Each update responds
                    promptly, then settles gently without a hard stop or bounce.
                    Only a new run resets the track. */}
                <div
                    key={run.startedAt}
                    className={`h-full w-full origin-left bg-accent transition-transform ease-[cubic-bezier(0.2,0.65,0.3,1)] motion-reduce:transition-none ${complete ? "duration-500" : "duration-2000"} ${discovering && active ? "animate-pulse motion-reduce:animate-none" : ""}`}
                    style={{
                        transform: `scaleX(${percent / 100})`,
                    }}
                />
            </div>
            {!discovering && (
                <p className="mt-2 text-xs tabular-nums text-sub">
                    {p.checked} of {p.total} emails checked
                </p>
            )}
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs tabular-nums text-sub">
                <span>{duration(elapsed)} elapsed</span>
                {active && (
                    <span>
                        {stalled
                            ? "Taking longer than expected"
                            : p.stage === "finishing"
                              ? "Finishing up"
                              : p.remainingMs === null
                                ? "Estimating time…"
                                : remainingTime(p.remainingMs - sinceUpdate)}
                    </span>
                )}
            </div>
            <ol className="mt-4 space-y-2.5">
                {stages.map((stage) => (
                    <li
                        key={stage.label}
                        className="flex items-start justify-between gap-3 text-xs"
                    >
                        <span
                            className={`flex min-w-0 items-start gap-2 ${stage.done || (stage.active && active) ? "text-ink" : "text-sub"}`}
                        >
                            <span
                                aria-hidden="true"
                                className={`mt-0.5 size-3 shrink-0 ${stage.done ? "icon-[lucide--check] text-accent" : stage.active && active ? "icon-[lucide--arrow-right] text-accent" : "icon-[lucide--minus] text-muted"}`}
                            />
                            {stage.label}
                        </span>
                        <span className="shrink-0 text-right tabular-nums text-sub">
                            {stage.detail}
                        </span>
                    </li>
                ))}
            </ol>
            {result ? (
                <p
                    role="status"
                    className="mt-4 text-pretty text-xs leading-5 text-sub"
                >
                    {result.ok
                        ? emailSyncSuccessMessage(result)
                        : result.message}
                    {!result.ok &&
                        p.checked > 0 &&
                        " Saved work is kept. Sync again to check the remaining emails."}
                </p>
            ) : p.found > 0 ? (
                <p className="mt-4 text-xs tabular-nums text-accent">
                    {p.found} suggestion{p.found === 1 ? "" : "s"} found
                </p>
            ) : null}
        </section>
    );
};
