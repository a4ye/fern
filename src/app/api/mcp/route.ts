import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@/lib/auth";
import { registerFernTools } from "@/lib/mcp/tools";

const handler = createMcpHandler(registerFernTools, {
    serverInfo: { name: "fern", version: "1" },
    instructions:
        "Fern tracks job applications. Lists hold applications, and an application records where it was sent, what it pays, and the statuses it has moved through. Read a list before changing it: every write needs an id that only a read hands out. Every change to a list is kept in that list's history and can be undone.",
});

// The token was issued by this app's own authorization server, so the session it
// stands for is the whole of what the caller may reach. Tools read the account
// from `extra.userId` and pass it to the same queries the dashboard uses, each
// of which answers for one user; a token is never a way to name another.
const verifyToken = async (_request: Request, bearerToken?: string) => {
    if (!bearerToken) return undefined;

    const session = await auth.api.getMcpSession({
        headers: new Headers({ authorization: `Bearer ${bearerToken}` }),
    });
    if (!session) return undefined;

    return {
        token: bearerToken,
        clientId: session.clientId,
        scopes: session.scopes?.split(" ") ?? [],
        expiresAt: Math.floor(
            new Date(session.accessTokenExpiresAt).getTime() / 1000,
        ),
        extra: { userId: session.userId },
    };
};

const authenticated = withMcpAuth(handler, verifyToken, { required: true });

export { authenticated as GET, authenticated as POST, authenticated as DELETE };
