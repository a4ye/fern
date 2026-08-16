// better-auth keeps GitHub's numeric account id, not the name the account is
// known by, so the username has to be asked for. The endpoint is public, and the
// answer is cached for a day: a username outlives that many times over, and the
// settings page is its only reader.
const USERNAME_MAX_AGE = 86_400;

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
