import { extensionApi } from "./api";
import { JOB_IMPORT_CHANNEL } from "../../src/lib/job-import/protocol";
import { parsePosting, withUrlFallback } from "../../src/lib/job-import/shared";

// `complete` can precede a client-rendered job description by a few frames.
// The delay happens only after the user explicitly chooses Open posting & import.
setTimeout(() => {
    const url = new URL(window.location.href);
    const posting = withUrlFallback(
        parsePosting(document.documentElement.outerHTML),
        url,
    );
    void extensionApi.runtime
        .sendMessage({
            channel: JOB_IMPORT_CHANNEL,
            internal: "visible-result",
            posting,
        })
        .catch(() => {});
}, 1200);
