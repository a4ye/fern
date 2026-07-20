import { CARET_PATH, SLASH_PATH } from "@/components/brand/logo";

export const LoginArt = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 320 320"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 h-full w-full"
    >
        <g transform="translate(20, 80) scale(6)">
            <path d={CARET_PATH} fill="#e6e9df" />
        </g>
        <g transform="translate(-30, 208) scale(2.8)">
            <path d={CARET_PATH} fill="#6f7d5f" />
        </g>
        <g transform="translate(78, 208) scale(2.8)">
            <path d={SLASH_PATH} fill="#8a6f3f" />
        </g>
    </svg>
);
