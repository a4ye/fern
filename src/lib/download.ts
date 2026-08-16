export const fileSlug = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "export";

export const saveFile = (href: string, filename: string) => {
    const link = document.createElement("a");
    link.download = filename;
    link.href = href;
    link.click();
};

export const saveBlob = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    saveFile(href, filename);
    // The click queues the read synchronously, so the handle has served its
    // purpose by the time this returns.
    URL.revokeObjectURL(href);
};
