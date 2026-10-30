export type EmailSyncProgress = {
    stage: "discovering" | "processing" | "finishing";
    total: number | null;
    read: number;
    checked: number;
    relevant: number;
    reviewed: number;
    found: number;
    activeReviews: number;
    remainingMs: number | null;
};

export const initialSyncProgress = (): EmailSyncProgress => ({
    stage: "discovering",
    total: null,
    read: 0,
    checked: 0,
    relevant: 0,
    reviewed: 0,
    found: 0,
    activeReviews: 0,
    remainingMs: null,
});

// Priors only affect the ETA. Counts always come from completed work. Reviews
// cost roughly one model round trip even when a group is only partially full.
const INITIAL_READ_MS_PER_EMAIL = 80;
const INITIAL_REVIEW_MS = 15_000;
const blend = (previous: number, sample: number) =>
    previous * 0.7 + sample * 0.3;

export const createSyncProgress = (
    onProgress: ((progress: EmailSyncProgress) => void) | undefined,
    { groupSize, concurrency }: { groupSize: number; concurrency: number },
    now: () => number = Date.now,
) => {
    const state = initialSyncProgress();
    let readMs = INITIAL_READ_MS_PER_EMAIL;
    let reviewMs = INITIAL_REVIEW_MS;
    const active = new Map<symbol, { startedAt: number; count: number }>();

    const estimate = (): number | null => {
        if (state.total === null || state.stage === "finishing") return null;
        const unread = Math.max(0, state.total - state.read);
        const fraction = state.read > 0 ? state.relevant / state.read : 0.4;
        const inFlight = [...active.values()];
        const queued = Math.max(
            0,
            state.relevant -
                state.reviewed -
                inFlight.reduce((sum, task) => sum + task.count, 0),
        );
        const lanes = Array.from({ length: concurrency }, (_, index) => {
            const task = inFlight[index];
            return task
                ? Math.max(1_000, reviewMs - (now() - task.startedAt))
                : 0;
        });
        // Assign queued and predicted groups to the next available reviewer.
        // Fetching overlaps those reviews; it is not another serial stage.
        const groups = Math.ceil((queued + unread * fraction) / groupSize);
        for (let index = 0; index < groups; index++) {
            const next = lanes.indexOf(Math.min(...lanes));
            lanes[next] += reviewMs;
        }
        const tail = unread > 0 && groups > 0 ? reviewMs / 2 : 0;
        return Math.max(unread * readMs, ...lanes) + tail + 1_000;
    };

    const emit = () => {
        onProgress?.({
            ...state,
            activeReviews: active.size,
            remainingMs: estimate(),
        });
    };

    return {
        start: emit,
        discover: (total: number) => {
            state.total = total;
            state.stage = "processing";
            emit();
        },
        read: (count: number, relevant: number, durationMs: number) => {
            state.read += count;
            state.relevant += relevant;
            if (count > 0)
                readMs = blend(readMs, Math.max(1, durationMs) / count);
            emit();
        },
        settle: (count: number) => {
            state.checked += count;
            emit();
        },
        review: (count: number) => {
            const id = Symbol();
            const startedAt = now();
            active.set(id, { startedAt, count });
            emit();
            return (found: number) => {
                active.delete(id);
                reviewMs = blend(reviewMs, Math.max(1, now() - startedAt));
                state.reviewed += count;
                state.checked += count;
                state.found += found;
                emit();
            };
        },
        finish: () => {
            state.stage = "finishing";
            emit();
        },
    };
};
