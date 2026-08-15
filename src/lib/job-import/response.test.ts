import { describe, expect, it } from "bun:test";
import {
    MAX_POSTING_HTML_BYTES,
    readPostingHtml,
} from "@/lib/job-import/response";

describe("readPostingHtml", () => {
    it("reads an ordinary posting response", async () => {
        expect(await readPostingHtml(new Response("<html>job</html>"))).toBe(
            "<html>job</html>",
        );
    });

    it("rejects a response declared above the shared size limit", async () => {
        const response = new Response("not read", {
            headers: {
                "content-length": String(MAX_POSTING_HTML_BYTES + 1),
            },
        });
        expect(await readPostingHtml(response)).toBeNull();
    });
});
