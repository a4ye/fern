// Presentation layer for the dashboard: UI types, status metadata, and pure
// formatters. Data is loaded from the database in src/db/dashboard.ts and mapped
// into these shapes; components read only from what they are passed.

export type ListStatus = "active" | "closed" | "archived";

export type ApplicationStatus =
    | "not_applied"
    | "applied"
    | "online_assessment"
    | "takehome"
    | "interviewing"
    | "onsite"
    | "offer_in_progress"
    | "offer_accepted"
    | "offer_declined"
    | "offer_rescinded"
    | "rejected"
    | "ghosted"
    | "other";

export type Arrangement = "remote" | "hybrid" | "onsite";

export type PayPeriod =
    "hourly" | "weekly" | "biweekly" | "monthly" | "yearly" | "one_time";

// `plate` is the filled chip used wherever a status is shown on its own, so
// applications read the same way lists do on the index.
export type StatusMeta = {
    label: string;
    tile: string;
    text: string;
    plate: string;
};

// Plates are borderless, so each fill has to stay legible against the row
// backgrounds it sits on: bg-background, bg-surface on hover, and
// bg-accent-tint-soft when selected.
const NEUTRAL_PLATE = "bg-hairline text-sub";
const SOFT_PLATE = "bg-accent-tint text-sub";
const SAGE_PLATE = "bg-accent-tint text-accent-deep";
const GOLD_PLATE = "bg-gold-tint text-gold";
const ROSE_PLATE = "bg-rose-tint text-rose";

// Early stages muted, mid stages sage, offer gold, accepted deep sage, closed rose.
export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
    not_applied: {
        label: "Not applied",
        tile: "bg-tile-border",
        text: "text-muted",
        plate: NEUTRAL_PLATE,
    },
    applied: {
        label: "Applied",
        tile: "bg-tile-border",
        text: "text-sub",
        plate: NEUTRAL_PLATE,
    },
    online_assessment: {
        label: "Online assessment",
        tile: "bg-accent-tint",
        text: "text-sub",
        plate: SOFT_PLATE,
    },
    takehome: {
        label: "Take-home",
        tile: "bg-accent-tint",
        text: "text-sub",
        plate: SOFT_PLATE,
    },
    interviewing: {
        label: "Interviewing",
        tile: "bg-accent",
        text: "text-accent-deep",
        plate: SAGE_PLATE,
    },
    onsite: {
        label: "Onsite",
        tile: "bg-accent-deep",
        text: "text-accent-deep",
        plate: SAGE_PLATE,
    },
    offer_in_progress: {
        label: "Offer in progress",
        tile: "bg-gold",
        text: "text-gold",
        plate: GOLD_PLATE,
    },
    offer_accepted: {
        label: "Offer accepted",
        tile: "bg-accent-deep",
        text: "text-accent-deep",
        plate: SAGE_PLATE,
    },
    offer_declined: {
        label: "Offer declined",
        tile: "bg-rose/40",
        text: "text-muted",
        plate: NEUTRAL_PLATE,
    },
    offer_rescinded: {
        label: "Offer rescinded",
        tile: "bg-rose",
        text: "text-rose",
        plate: ROSE_PLATE,
    },
    rejected: {
        label: "Rejected",
        tile: "bg-rose",
        text: "text-rose",
        plate: ROSE_PLATE,
    },
    ghosted: {
        label: "Ghosted",
        tile: "bg-rose/40",
        text: "text-muted",
        plate: NEUTRAL_PLATE,
    },
    other: {
        label: "Other",
        tile: "bg-tile-border",
        text: "text-muted",
        plate: NEUTRAL_PLATE,
    },
};

// Search terms that stand in for a status without appearing in its label, so
// typing what happened ("hackerrank", "no reply", "signed") finds the right one.
// The status vocabulary is closed and small, which is why a written-out list
// beats anything model-driven here: it is exhaustive, instant, and offline.
export const STATUS_KEYWORDS: Record<ApplicationStatus, string[]> = {
    not_applied: [
        "not applied",
        "todo",
        "to do",
        "saved",
        "bookmarked",
        "wishlist",
        "shortlist",
        "backlog",
        "planned",
        "queued",
        "prospect",
        "lead",
        "open",
        "draft",
        "havent applied",
        "yet to apply",
    ],
    applied: [
        "applied",
        "submitted",
        "sent",
        "application sent",
        "in review",
        "under review",
        "pending",
        "waiting",
        "awaiting",
        "no news",
        "resume sent",
        "applied online",
    ],
    online_assessment: [
        "online assessment",
        "oa",
        "assessment",
        "codesignal",
        "hackerrank",
        "codility",
        "leetcode",
        "coderbyte",
        "karat",
        "hirevue",
        "coding test",
        "coding challenge",
        "timed test",
        "screening test",
        "quiz",
        "aptitude",
    ],
    takehome: [
        "take home",
        "takehome",
        "project",
        "assignment",
        "coding project",
        "homework",
        "exercise",
        "case study",
        "work sample",
    ],
    interviewing: [
        "interview",
        "interviews",
        "phone screen",
        "phone interview",
        "recruiter call",
        "recruiter screen",
        "hr screen",
        "screen",
        "technical interview",
        "tech screen",
        "behavioral",
        "system design",
        "first round",
        "second round",
        "video interview",
        "chat",
    ],
    onsite: [
        "onsite",
        "on site",
        "final round",
        "final",
        "superday",
        "super day",
        "loop",
        "panel",
        "last round",
        "in person",
        "site visit",
        "office visit",
    ],
    offer_in_progress: [
        "offer in progress",
        "offer",
        "verbal offer",
        "pending offer",
        "negotiating",
        "negotiation",
        "reviewing offer",
        "deciding",
        "considering",
        "compensation",
        "comp",
        "terms",
        "deadline",
    ],
    offer_accepted: [
        "offer accepted",
        "accepted",
        "signed",
        "signed offer",
        "hired",
        "joined",
        "took it",
        "got the job",
        "yes",
        "won",
    ],
    offer_declined: [
        "offer declined",
        "declined",
        "turned it down",
        "passed",
        "no thanks",
        "withdrew",
        "walked away",
        "said no",
        "went elsewhere",
    ],
    offer_rescinded: [
        "offer rescinded",
        "rescinded",
        "revoked",
        "offer pulled",
        "pulled",
        "reneged",
        "cancelled",
        "canceled",
        "role closed",
        "backed out",
    ],
    rejected: [
        "rejected",
        "rejection",
        "denied",
        "no",
        "not selected",
        "not moving forward",
        "unsuccessful",
        "pass",
        "dinged",
        "ding",
        "lost",
        "eliminated",
    ],
    ghosted: [
        "ghosted",
        "ghost",
        "no reply",
        "no response",
        "never heard back",
        "silence",
        "radio silence",
        "stale",
        "ignored",
        "abandoned",
        "dead",
    ],
    other: [
        "other",
        "misc",
        "miscellaneous",
        "unknown",
        "unsure",
        "not sure",
        "custom",
        "something else",
    ],
};

// Statuses that count as still moving through the pipeline (not terminal).
export const ACTIVE_STATUSES: ApplicationStatus[] = [
    "applied",
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
    "offer_in_progress",
];

export const INTERVIEWING_STATUSES: ApplicationStatus[] = [
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
];

export const OFFER_STATUSES: ApplicationStatus[] = [
    "offer_in_progress",
    "offer_accepted",
];

const ARRANGEMENT_LABEL: Record<Arrangement, string> = {
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "Onsite",
};

export const arrangementLabel = (arrangement: Arrangement): string =>
    ARRANGEMENT_LABEL[arrangement];

const PERIOD_LABEL: Record<PayPeriod, string> = {
    hourly: "Hourly",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
    yearly: "Yearly",
    one_time: "One time",
};

export const PAY_PERIODS = Object.keys(PERIOD_LABEL) as PayPeriod[];

export const payPeriodLabel = (period: PayPeriod): string =>
    PERIOD_LABEL[period];

const PERIOD_SUFFIX: Record<PayPeriod, string> = {
    hourly: "/hr",
    weekly: "/wk",
    biweekly: "/2wk",
    monthly: "/mo",
    yearly: "/yr",
    one_time: "",
};

export type ListSummary = {
    id: string;
    name: string;
    description: string | null;
    status: ListStatus;
    pinned: boolean;
    updatedAt: string;
    totalApplications: number;
};

export const LIST_SORTS = [
    { key: "recent", label: "Recently edited" },
    { key: "name", label: "Name" },
    { key: "applications", label: "Applications" },
] as const;

export type ListSort = (typeof LIST_SORTS)[number]["key"];

export const LIST_PAGE_SIZE = 8;

export const parseListSort = (value: string | undefined): ListSort =>
    LIST_SORTS.some((option) => option.key === value)
        ? (value as ListSort)
        : "recent";

// One step in an application's status history. The opening step is where the
// application started out rather than a move anyone recorded, so it has no
// event behind it and cannot be taken back on its own.
export type StatusStep = {
    id: string | null;
    status: ApplicationStatus;
    at: string | null;
};

export type ApplicationRow = {
    id: string;
    company: string;
    role: string | null;
    status: ApplicationStatus;
    // `pay` is the rendered label, which may come from the structured pay range;
    // `payNote` is the free-text field the quick editor writes back to. The
    // amounts below are what the detail panel edits directly.
    pay: string | null;
    payNote: string | null;
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    bonus: string | null;
    location: string | null;
    arrangement: Arrangement | null;
    appliedAt: string | null;
    url: string | null;
    notes: string | null;
    history: StatusStep[];
    updated: string;
};

export const ARRANGEMENTS: Arrangement[] = ["remote", "hybrid", "onsite"];

export const APPLICATION_STATUSES = Object.keys(
    STATUS_META,
) as ApplicationStatus[];

export type Stat = { label: string; value: string };

export type PipelineEntry = { status: ApplicationStatus; count: number };

// One application's status history, so the flow chart can show where things
// travelled rather than only where they ended up. `history` is chronological,
// earliest first, and ends on the current status. It may revisit a status.
export type FlowEntry = {
    status: ApplicationStatus;
    history: ApplicationStatus[];
};

export type ActivityItem = {
    id: string;
    company: string;
    toStatus: ApplicationStatus | null;
    note: string | null;
    when: string;
};

export type ListDetail = {
    id: string;
    name: string;
    description: string | null;
    status: ListStatus;
    stats: Stat[];
    applications: ApplicationRow[];
    pipeline: PipelineEntry[];
    flow: FlowEntry[];
    activity: ActivityItem[];
};

// A proposed status change detected from a connected inbox, shown for review.
export type EmailSuggestion = {
    id: string;
    applicationId: string;
    company: string;
    role: string | null;
    listId: string;
    listName: string;
    from: string;
    subject: string;
    snippet: string;
    receivedAt: string;
    currentStatus: ApplicationStatus;
    suggestedStatus: ApplicationStatus;
    confidence: number;
    reasoning: string | null;
};

export type EmailSyncPanel = {
    // Feature is configured on the server (Google credentials present).
    enabled: boolean;
    // User has linked a Google account.
    connected: boolean;
    lastSyncedAt: string | null;
    suggestions: EmailSuggestion[];
};

const WHOLE_AMOUNT = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
});

const CENT_AMOUNT = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

// Salaries read better whole, but cents are the whole point of an hourly rate
// like 32.50, so they are kept only when the amount actually has them.
const formatAmount = (amount: number): string =>
    Number.isInteger(amount)
        ? WHOLE_AMOUNT.format(amount)
        : CENT_AMOUNT.format(amount);

// Renders a pay range into a compact label, e.g. "USD 9,000/mo" or
// "USD 9,000–11,000/mo". The currency is named by its ISO code rather than a
// symbol: four currencies write themselves "$", and the ones with no symbol in
// this locale fall back to the code anyway, so codes are the only form every
// row can share. A range names it once. Falls back to the free-text pay note
// when no amounts are set. Uses an en dash for the range, never an em dash.
export const formatPay = (input: {
    payMin: string | null;
    payMax: string | null;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    payNote: string | null;
}): string | null => {
    const min = input.payMin !== null ? Number(input.payMin) : null;
    const max = input.payMax !== null ? Number(input.payMax) : null;
    if (min === null && max === null) return input.payNote;

    const currency = input.payCurrency || "USD";
    const suffix = input.payPeriod ? PERIOD_SUFFIX[input.payPeriod] : "";
    const base =
        min !== null && max !== null && max !== min
            ? `${formatAmount(min)}–${formatAmount(max)}`
            : formatAmount((min ?? max) as number);
    return `${currency} ${base}${suffix}`;
};

export const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

// Applied dates come from a `date` column, which carries no time zone, so they
// travel as plain yyyy-mm-dd strings and are formatted from their parts. Going
// through `new Date(value)` would read them as UTC midnight and land on the
// previous day for anyone west of it.
export const toDateInput = (date: Date): string =>
    [
        date.getFullYear(),
        `${date.getMonth() + 1}`.padStart(2, "0"),
        `${date.getDate()}`.padStart(2, "0"),
    ].join("-");

export const formatDay = (value: string): string => {
    const [year, month, day] = value.split("-").map(Number);
    const label = `${MONTHS[month - 1]} ${day}`;
    return year === new Date().getFullYear() ? label : `${label}, ${year}`;
};

export const formatEdited = (iso: string): string =>
    new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });

// Turns a timestamp into a short relative label for tables and feeds.
export const formatRelative = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (seconds < 60) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (weeks < 5) return `${weeks}w ago`;
    return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
    });
};
