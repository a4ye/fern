import * as Sentry from "@sentry/nextjs";

Sentry.init({
    enabled: process.env.NODE_ENV !== "development",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
