import { describe, expect, it } from "bun:test";
import { GITHUB_URL } from "@/lib/site";

describe("GITHUB_URL", () => {
    describe("format", () => {
        it("is the project repository over https", () => {
            expect(GITHUB_URL).toBe("https://github.com/a4ye/job-tracker");
        });

        it("parses to the expected host and path", () => {
            const url = new URL(GITHUB_URL);
            expect(url.protocol).toBe("https:");
            expect(url.hostname).toBe("github.com");
            expect(url.pathname).toBe("/a4ye/job-tracker");
        });
    });

    describe("reachability", () => {
        // A public repo returns 200; a missing or private one returns 404. This
        // catches a renamed, deleted, or still-private repo, so the public
        // footer and nav links never point at a 404.
        it("resolves to a live, public repository page", async () => {
            const res = await fetch(GITHUB_URL, {
                headers: { "user-agent": "job-tracker-tests" },
                redirect: "follow",
            });
            if (res.status === 404) {
                throw new Error(
                    `${GITHUB_URL} returned 404. GitHub serves 404 for private ` +
                        "or nonexistent repositories to signed-out visitors, so " +
                        "the public footer and nav links would 404 too. Make the " +
                        "repo public (or fix the URL) for this to pass.",
                );
            }
            expect(res.status).toBe(200);
            expect(res.url).toContain("github.com/a4ye/job-tracker");
        }, 15000);
    });
});
