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
    // Local variables are deliberately not captured. A stack frame on this
    // server holds Gmail access tokens, session tokens and the text of
    // somebody's mail, and a scrubber can only hide the things it was told to
    // look for. Sending all of it and redacting what we thought of is the wrong
    // way round for a third party that keeps what it is given.
    includeLocalVariables: false,
});
