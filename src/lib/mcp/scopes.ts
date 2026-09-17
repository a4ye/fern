// What a token is allowed to do, named so a person can be told it.
//
// A scope does not defend against a client that means harm: it asks for
// whatever it wants, and an attacker's client asks for everything. What it
// buys is a truthful consent screen and a way to hand out less. An agent that
// only ever reads can be connected read only, and then a prompt that talks it
// into deleting a list cannot.
export const SCOPE_READ = "fern:read";
export const SCOPE_WRITE = "fern:write";

export const FERN_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;

// A client that names no scope gets both, which is what every client connected
// before these existed was already getting. Narrowing is therefore something a
// client opts into rather than something that silently breaks it, and asking
// for `fern:read` alone is held to.
export const DEFAULT_SCOPE = `openid ${SCOPE_READ} ${SCOPE_WRITE}`;

export const READ_ONLY_TOKEN =
    "This connection is read only. Reconnect it with write access to make changes.";

export const allowsWrite = (scopes: string[]): boolean => {
    if (scopes.includes(SCOPE_WRITE)) return true;
    // Naming neither is what a token issued before these scopes existed looks
    // like, and what a client that does not use them asks for. It was granted
    // when every connection could write, so it keeps that until it expires
    // rather than having a narrower grant applied to it after the fact. Only
    // asking for read and not write is a choice, and that one is held to.
    return !scopes.includes(SCOPE_READ);
};
