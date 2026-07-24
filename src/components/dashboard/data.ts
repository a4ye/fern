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

export type StatusMeta = { label: string; tile: string; text: string };

// Early stages muted, mid stages sage, offer gold, accepted deep sage, closed rose.
export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
    not_applied: {
        label: "Not applied",
        tile: "bg-tile-border",
        text: "text-muted",
    },
    applied: { label: "Applied", tile: "bg-tile-border", text: "text-sub" },
    online_assessment: {
        label: "Online assessment",
        tile: "bg-accent-tint",
        text: "text-sub",
    },
    takehome: { label: "Take-home", tile: "bg-accent-tint", text: "text-sub" },
    interviewing: {
        label: "Interviewing",
        tile: "bg-accent",
        text: "text-accent-deep",
    },
    onsite: {
        label: "Onsite",
        tile: "bg-accent-deep",
        text: "text-accent-deep",
    },
    offer_in_progress: {
        label: "Offer in progress",
        tile: "bg-gold",
        text: "text-gold",
    },
    offer_accepted: {
        label: "Offer accepted",
        tile: "bg-accent-deep",
        text: "text-accent-deep",
    },
    offer_declined: {
        label: "Offer declined",
        tile: "bg-rose/40",
        text: "text-muted",
    },
    offer_rescinded: {
        label: "Offer rescinded",
        tile: "bg-rose",
        text: "text-rose",
    },
    rejected: { label: "Rejected", tile: "bg-rose", text: "text-rose" },
    ghosted: { label: "Ghosted", tile: "bg-rose/40", text: "text-muted" },
    other: { label: "Other", tile: "bg-tile-border", text: "text-muted" },
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

export type ApplicationRow = {
    id: string;
    company: string;
    role: string | null;
    status: ApplicationStatus;
    pay: string | null;
    location: string | null;
    arrangement: Arrangement | null;
    url: string | null;
    notes: string | null;
    updated: string;
};

export type Stat = { label: string; value: string; detail: string };

export type PipelineEntry = { status: ApplicationStatus; count: number };

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

const moneyFormatters = new Map<string, Intl.NumberFormat>();

const formatMoney = (amount: number, currency: string): string => {
    let formatter = moneyFormatters.get(currency);
    if (!formatter) {
        formatter = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        });
        moneyFormatters.set(currency, formatter);
    }
    return formatter.format(amount);
};

// Renders a pay range into a compact label, e.g. "$9,000/mo" or
// "$9,000–$11,000/mo". Falls back to the free-text pay note when no amounts are
// set. Uses an en dash for the range, never an em dash.
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
            ? `${formatMoney(min, currency)}–${formatMoney(max, currency)}`
            : formatMoney((min ?? max) as number, currency);
    return `${base}${suffix}`;
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
