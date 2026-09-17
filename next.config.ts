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
    // Sent with every response rather than on the pages that need them, so a
    // route added later is covered without anybody remembering to.
    //
    // `frame-ancestors` is the one with an attack behind it: the consent screen
    // at /oauth/authorize turns a single click into an agent holding an
    // account, and a page that can be framed can have that click aimed at it
    // from a site the reader thinks they are on. X-Frame-Options says the same
    // thing to browsers that predate CSP.
    //
    // This is not a full policy. Restricting `script-src` needs a nonce
    // threaded through the proxy, and shipping one unverified would be a way to
    // find out in production which of the app's scripts it broke.
    headers: async () => [
        {
            source: "/:path*",
            headers: [
                {
                    key: "Content-Security-Policy",
                    value: "frame-ancestors 'none'",
                },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                // Same-origin requests still carry the whole address, which is
                // what the app's own navigation needs. A share link is a
                // credential in a path, and the page that holds one asks for
                // `no-referrer` itself rather than relying on this.
                {
                    key: "Referrer-Policy",
                    value: "strict-origin-when-cross-origin",
                },
                {
                    key: "Permissions-Policy",
                    value: "camera=(), microphone=(), geolocation=(), payment=()",
                },
            ],
        },
    ],
    // An MCP client discovers how to authenticate by reading two documents at
    // fixed .well-known addresses. Next leaves dot-prefixed directories out of
    // the app router, so the handlers live under /api and are reached here.
    // RFC 9728 lets a client append the resource path to the second one, so
    // every path below it answers as well as the bare address.
    rewrites: async () => [
        {
            source: "/.well-known/oauth-authorization-server",
            destination: "/api/well-known/oauth-authorization-server",
        },
        {
            source: "/.well-known/oauth-protected-resource",
            destination: "/api/well-known/oauth-protected-resource",
        },
        {
            source: "/.well-known/oauth-protected-resource/:path*",
            destination: "/api/well-known/oauth-protected-resource",
        },
    ],
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
