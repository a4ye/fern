"use client";

import React, { useEffect, useRef } from "react";

export const ParallaxLayer = ({
    children,
    strength = 8,
    className = "",
}: {
    children: React.ReactNode;
    strength?: number;
    className?: string;
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }

        let raf = 0;
        const onMove = (event: MouseEvent) => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const x = (event.clientX / window.innerWidth - 0.5) * 2;
                const y = (event.clientY / window.innerHeight - 0.5) * 2;
                node.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
            });
        };

        window.addEventListener("mousemove", onMove, { passive: true });
        return () => {
            window.removeEventListener("mousemove", onMove);
            cancelAnimationFrame(raf);
        };
    }, [strength]);

    return (
        <div
            ref={ref}
            className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
        >
            {children}
        </div>
    );
};
