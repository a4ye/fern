// Keep a malformed or unexpectedly large provider response from consuming an
// unbounded amount of memory in either the server fallback or browser extension.
export const MAX_POSTING_HTML_BYTES = 5_000_000;

export const readPostingHtml = async (
    response: Response,
): Promise<string | null> => {
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_POSTING_HTML_BYTES) return null;
    if (!response.body) {
        const text = await response.text();
        return text.length <= MAX_POSTING_HTML_BYTES ? text : null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_POSTING_HTML_BYTES) {
            await reader.cancel();
            return null;
        }
        parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
};
