// Deny-by-default gate for the admin tools. The allowlist stays on the server
// and uses exact email matches, so a typo or a partial match cannot hand the
// tools to an account nobody meant to trust. An unset variable means nobody is
// an admin, which is what a deployment that never configured this should get.
//
// The address has to be one GitHub confirmed belongs to the person, because on
// its own it is only a string on a profile, and matching it is what opens every
// account in the deployment read only. better-auth records whether the provider
// verified it, and an unverified match is treated as no match at all.
export const isAdmin = (
    user:
        | { email?: string | null; emailVerified?: boolean | null }
        | null
        | undefined,
    adminEmails: string | null | undefined = process.env.ADMIN_EMAILS,
): boolean => {
    if (!user?.emailVerified) return false;

    const candidate = user.email?.trim().toLowerCase();
    if (!candidate || !adminEmails) return false;

    return adminEmails
        .split(",")
        .some((admin) => admin.trim().toLowerCase() === candidate);
};
