"use client";

import { useEffect, useRef, useState } from "react";

// Starts fully inked (the SSR/no-JS/reduced-motion state), then hands
// control to scroll progress so the words fill as the reader arrives.
export const WordFill = ({
    text,
    className = "",
    activeClass = "text-ink",
    inactiveClass = "text-muted",
}: {
    text: string;
    className?: string;
    activeClass?: string;
    inactiveClass?: string;
}) => {
    const ref = useRef<HTMLParagraphElement>(null);
    const [progress, setProgress] = useState(1);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }

        let raf = 0;
        const update = () => {
            const rect = node.getBoundingClientRect();
            const vh = window.innerHeight;
            const raw = (vh * 0.85 - rect.top) / (vh * 0.5);
            setProgress(Math.min(1, Math.max(0, raw)));
        };
        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            cancelAnimationFrame(raf);
        };
    }, []);

    const chars = [...text];
    const active = Math.round(progress * chars.length);

    return (
        <p ref={ref} className={className}>
            {chars.map((char, index) => (
                <span
                    key={index}
                    className={`transition-colors duration-200 ${
                        index < active ? activeClass : inactiveClass
                    }`}
                >
                    {char}
                </span>
            ))}
        </p>
    );
};
