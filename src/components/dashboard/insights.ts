// What the two panels above the table count. Both read the same history the
// flow chart draws, so an application counts where it passed through even when
// the row has since moved on.

import {
    INTERVIEWING_STATUSES,
    toDateInput,
    type ApplicationStatus,
    type FlowEntry,
    type Funnel,
    type FunnelStageKey,
    type Volume,
} from "@/components/dashboard/data";

// A rejection is still a reply. Being ghosted is the absence of one, so it
// counts as sent and never as a reply.
const REPLIED: ApplicationStatus[] = [
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
    "offer_in_progress",
    "offer_accepted",
    "offer_declined",
    "offer_rescinded",
    "rejected",
];

// An offer was made even when it was later declined or pulled.
const OFFERED: ApplicationStatus[] = [
    "offer_in_progress",
    "offer_accepted",
    "offer_declined",
    "offer_rescinded",
];

// "Other" says nothing about whether the application was ever sent, so it is
// left out rather than counted as one.
const SENT: ApplicationStatus[] = ["applied", "ghosted", ...REPLIED];

export const wasSent = (history: ApplicationStatus[]): boolean =>
    history.some((status) => SENT.includes(status));

export const funnelFrom = (flow: FlowEntry[]): Funnel => {
    const reaching = (statuses: ApplicationStatus[]) =>
        flow.filter((entry) =>
            entry.history.some((status) => statuses.includes(status)),
        ).length;

    const applied = reaching(SENT);
    const stage = (
        key: FunnelStageKey,
        label: string,
        statuses: ApplicationStatus[],
    ) => {
        const count = reaching(statuses);
        return {
            key,
            label,
            count,
            percent: applied === 0 ? 0 : Math.round((count / applied) * 100),
        };
    };

    return {
        applied,
        stages: [
            stage("replied", "Heard back", REPLIED),
            stage("interviewed", "Interviewed", INTERVIEWING_STATUSES),
            stage("offer", "Offer", OFFERED),
        ],
    };
};

const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

// The activity graph needs exact calendar days at every timescale. Empty days
// are derived in the renderer, so only dates with an application travel to the
// client.
export const volumeFrom = (dates: Date[], today = new Date()): Volume => {
    const counts = new Map<string, number>();
    for (const date of dates) {
        const key = toDateInput(startOfDay(date));
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return {
        total: dates.length,
        through: toDateInput(startOfDay(today)),
        days: Array.from(counts, ([date, count]) => ({ date, count })).sort(
            (first, second) => first.date.localeCompare(second.date),
        ),
    };
};
