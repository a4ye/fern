const STAGE_STYLES = {
    saved: "bg-tile-border",
    applied: "bg-accent-tint",
    interview: "bg-accent",
    offer: "bg-gold",
    rejected: "bg-rose",
} as const;

type Stage = keyof typeof STAGE_STYLES;

// One mark per application: a plausible season, most of it applied,
// a scatter of interviews and rejections, exactly one gold offer.
const SEASON: Stage[] = [
    "applied",
    "applied",
    "rejected",
    "applied",
    "interview",
    "applied",
    "applied",
    "rejected",
    "applied",
    "applied",
    "saved",
    "applied",
    "interview",
    "rejected",
    "applied",
    "applied",
    "applied",
    "interview",
    "applied",
    "rejected",
    "saved",
    "applied",
    "applied",
    "interview",
    "applied",
    "rejected",
    "applied",
    "applied",
    "applied",
    "offer",
    "rejected",
    "applied",
    "saved",
    "applied",
    "interview",
    "applied",
    "rejected",
    "applied",
    "applied",
    "applied",
];

export const Pipeline = () => (
    <div
        aria-hidden="true"
        className="grid grid-cols-10 gap-1.5 sm:grid-cols-[repeat(20,minmax(0,1fr))]"
    >
        {SEASON.map((stage, index) => (
            <span
                key={index}
                style={{ animationDelay: `${index * 120}ms` }}
                className={`pip aspect-square w-full ${STAGE_STYLES[stage]}`}
            />
        ))}
    </div>
);
