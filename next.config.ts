import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
    env: {
        // VERCEL_ENV is the only thing that separates a preview deployment from
        // production, and it exists on the build machine but not in the browser.
        // Inlining it here gives every runtime the same answer.
        SENTRY_ENVIRONMENT: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    },
    experimental: {
        // Spreadsheet imports travel to a server action as the file itself, and
        // the rows travel back up to be written. Both are well past the 1 MB an
        // action carries by default. The importer refuses a file at 5 MB, so
        // this sits above that and the friendlier message is the one seen.
        //
        // This is also the most a single request can make the server hold, for
        // every action and whoever sends it, since the body is read before any
        // of them get to check who is asking. Raise it no further than an
        // import actually needs.
        serverActions: { bodySizeLimit: "8mb" },
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "avatars.githubusercontent.com",
            },
        ],
    },
};

export default withSentryConfig(nextConfig, {
    org: "aaron-kw",
    project: "fern",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    widenClientFileUpload: true,
    silent: !process.env.CI,
    bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeReplayIframe: true,
        excludeReplayShadowDom: true,
        excludeReplayWorker: true,
    },
});
