import * as Sentry from "@sentry/nextjs";
import { scrubShareToken } from "@/lib/scrub-share-token";
import { keepSlowTransactions } from "@/lib/slow-transactions";

Sentry.init({
    enabled: process.env.NODE_ENV !== "development",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    tracesSampleRate: 1,
    beforeSendTransaction: keepSlowTransactions,
    // A share link is a credential in a URL, so nothing that records a URL may
    // record one. See the helper for the shapes it arrives in.
    beforeSend: scrubShareToken,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
