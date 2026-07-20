export const CARET_PATH = "M8 40 L24 10 L32 10 L48 40 L40 40 L28 17 L16 40 Z";
export const SLASH_PATH = "M72 10 L80 10 L64 40 L56 40 Z";

export const Logo = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 88 50"
        fill="none"
        role="img"
        aria-label="Job Tracker"
        className={className}
    >
        <path d={CARET_PATH} fill="#6f7d5f" />
        <path d={SLASH_PATH} fill="#8a6f3f" />
    </svg>
);
