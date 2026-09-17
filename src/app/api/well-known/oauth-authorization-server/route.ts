import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

// Where an MCP client looks to find out how to sign its user in. Rewritten onto
// /.well-known/oauth-authorization-server in next.config.ts, because Next leaves
// dot-prefixed directories out of the app router.
export const GET = oAuthDiscoveryMetadata(auth);

export const OPTIONS = metadataCorsOptionsRequestHandler();
