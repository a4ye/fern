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
    type VolumeBar,
    type VolumeDay,
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

const DAY = 24 * 60 * 60 * 1000;

// Applications go out in bursts, so counting a long run day by day draws a comb
// of single-day spikes rather than a shape. Past a few weeks the run is counted
// in weeks, and each week carries the days behind it for the hover to name.
const DAILY_SPAN_DAYS = 45;
const WEEKLY_SPAN_DAYS = 300;

const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date) => {
    const start = startOfDay(date);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
};

const startOfMonth = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), 1);

const START_OF: Record<Volume["unit"], (date: Date) => Date> = {
    day: startOfDay,
    week: startOfWeek,
    month: startOfMonth,
};

// Read on its own in a hover hint, with no axis around it for context, so a
// month carries its year to tell one January from another.
const LABEL_FORMAT: Record<Volume["unit"], Intl.DateTimeFormatOptions> = {
    day: { month: "short", day: "numeric" },
    week: { month: "short", day: "numeric" },
    month: { month: "short", year: "numeric" },
};

const labelFor = (start: Date, unit: Volume["unit"]) =>
    start.toLocaleDateString("en-US", LABEL_FORMAT[unit]);

// When applications went out, counted into even periods across the whole span
// they cover.
export const volumeFrom = (dates: Date[]): Volume => {
    if (dates.length === 0) return { total: 0, unit: "week", bars: [] };

    const times = dates.map((date) => date.getTime()).sort((a, b) => a - b);
    const first = new Date(times[0]);
    const last = new Date(times[times.length - 1]);
    const span = (last.getTime() - first.getTime()) / DAY;
    const unit: Volume["unit"] =
        span <= DAILY_SPAN_DAYS
            ? "day"
            : span <= WEEKLY_SPAN_DAYS
              ? "week"
              : "month";
    const startOf = START_OF[unit];

    const counts = new Map<number, number>();
    for (const time of times) {
        const key = startOf(new Date(time)).getTime();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // A week is drawn as one point but was lived as seven, so each one carries
    // the days that actually had applications on them. Only the days that did:
    // the empty ones are the gaps between, and naming them says nothing.
    const byDay = new Map<number, number>();
    if (unit === "week")
        for (const time of times) {
            const key = startOfDay(new Date(time)).getTime();
            byDay.set(key, (byDay.get(key) ?? 0) + 1);
        }

    const daysIn = (start: Date): VolumeDay[] => {
        const days: VolumeDay[] = [];
        const cursor = new Date(start);
        for (let step = 0; step < 7; step++) {
            const count = byDay.get(cursor.getTime()) ?? 0;
            if (count > 0) days.push({ label: labelFor(cursor, "day"), count });
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    };

    const bars: VolumeBar[] = [];
    const cursor = startOf(first);
    const end = startOf(last).getTime();
    while (cursor.getTime() <= end) {
        bars.push({
            label: labelFor(cursor, unit),
            start: toDateInput(cursor),
            count: counts.get(cursor.getTime()) ?? 0,
            days: unit === "week" ? daysIn(cursor) : [],
        });
        if (unit === "month") cursor.setMonth(cursor.getMonth() + 1);
        else cursor.setDate(cursor.getDate() + (unit === "week" ? 7 : 1));
    }

    return { total: times.length, unit, bars };
};
