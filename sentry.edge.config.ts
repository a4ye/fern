import * as Sentry from "@sentry/nextjs";
import { scrubShareToken } from "@/lib/scrub-share-token";

Sentry.init({
    enabled: process.env.NODE_ENV !== "development",
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
    // A share link is a credential in a URL, so nothing that records a URL may
    // record one. See the helper for the shapes it arrives in.
    beforeSend: scrubShareToken,
});
