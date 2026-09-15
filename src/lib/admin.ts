// Deny-by-default gate for the admin tools. The allowlist stays on the server
// and uses exact email matches, so a typo or a partial match cannot hand the
// tools to an account nobody meant to trust. An unset variable means nobody is
// an admin, which is what a deployment that never configured this should get.
export const isAdmin = (
    email: string | null | undefined,
    adminEmails: string | null | undefined = process.env.ADMIN_EMAILS,
): boolean => {
    const candidate = email?.trim().toLowerCase();
    if (!candidate || !adminEmails) return false;

    return adminEmails
        .split(",")
        .some((admin) => admin.trim().toLowerCase() === candidate);
};
