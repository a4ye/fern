"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track, type CtaLocation } from "@/lib/analytics";

// A link into the app from a signed-out page. Only the click needs the
// browser, so the page around it stays a server component.
export const CtaLink = ({
    location,
    ...props
}: ComponentProps<typeof Link> & { location: CtaLocation }) => (
    <Link {...props} onClick={() => track("cta-click", { location })} />
);
