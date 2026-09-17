import {
    getPublicOrigin,
    metadataCorsOptionsRequestHandler,
    protectedResourceHandler,
} from "mcp-handler";

// Which authorization server guards /api/mcp, which for this app is the app
// itself. The origin is read off the request rather than configured, so a
// preview deployment answers for its own host.
export const GET = (request: Request): Response =>
    protectedResourceHandler({
        authServerUrls: [getPublicOrigin(request)],
    })(request);

export const OPTIONS = metadataCorsOptionsRequestHandler();
