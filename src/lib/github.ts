// better-auth keeps GitHub's numeric account id, not the name the account is
// known by, so the username has to be asked for. The endpoint is public, and the
// answer is cached for a day: a username outlives that many times over, and the
// settings page is its only reader.
const USERNAME_MAX_AGE = 86_400;

// What a lookup that did not find an account can be: GitHub said there is no
// such user, or GitHub could not be asked. The two read very differently to the
// person typing, so they do not share a message.
export type GithubLookup =
    | { status: "found"; accountId: string }
    | { status: "missing" }
    | { status: "unavailable" };

// The other direction: a username to the numeric id better-auth stored, which is
// what a Fern account can be found by. Adding a friend is the only caller, and
// the same answer serves everyone who types that name for the next day, so a
// crowd adding each other costs GitHub one request per person.
export const githubAccountId = async (
    username: string,
): Promise<GithubLookup> => {
    try {
        const response = await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            {
                headers: { accept: "application/vnd.github+json" },
                next: { revalidate: USERNAME_MAX_AGE },
                signal: AbortSignal.timeout(2500),
            },
        );
        if (response.status === 404) return { status: "missing" };
        // A rate limit or an outage is not the same as no such person, and
        // telling someone their friend does not exist because GitHub was busy
        // would send them looking for a mistake they did not make.
        if (!response.ok) return { status: "unavailable" };

        const profile: unknown = await response.json();
        const id =
            typeof profile === "object" && profile !== null
                ? (profile as { id?: unknown }).id
                : null;
        return typeof id === "number" && Number.isSafeInteger(id)
            ? { status: "found", accountId: String(id) }
            : { status: "unavailable" };
    } catch {
        return { status: "unavailable" };
    }
};

export const githubUsername = async (
    accountId: string,
): Promise<string | null> => {
    if (!/^\d+$/.test(accountId)) return null;

    try {
        const response = await fetch(
            `https://api.github.com/user/${accountId}`,
            {
                headers: { accept: "application/vnd.github+json" },
                next: { revalidate: USERNAME_MAX_AGE },
                // The username is decorative and already has an email fallback,
                // so a slow GitHub response must not hold the settings page.
                signal: AbortSignal.timeout(1500),
            },
        );
        // A rate limit or an outage costs the username, not the page, so the
        // caller falls back to the email address it already holds.
        if (!response.ok) return null;
        const profile: unknown = await response.json();
        const login =
            typeof profile === "object" && profile !== null
                ? (profile as { login?: unknown }).login
                : null;
        return typeof login === "string" && login ? login : null;
    } catch {
        return null;
    }
};
