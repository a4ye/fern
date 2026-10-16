// Which model reads the inbox. Both answer the same question and return the
// same shape; what differs is how they are asked and what that costs.
//
// Client and server both read this file, so it holds names and nothing else.
// The two implementations live beside it and are imported only where one is
// actually about to be called, so a sync never loads the one it is not using.

export const CLASSIFIERS = ["jev", "gemini"] as const;

export type Classifier = (typeof CLASSIFIERS)[number];

// Jev leads because it is the one measured to miss less. Across a thousand
// messages of a real inbox it reported every status change that had already
// been confirmed by hand, and it answers in about a sixth of a second against
// several seconds for a batch, which is what decides whether a large sync
// finishes inside the request at all.
export const DEFAULT_CLASSIFIER: Classifier = "jev";

export const CLASSIFIER_LABELS: Record<Classifier, string> = {
    jev: "Jev",
    // Marked in the label rather than only in the hint, so the one being left
    // behind says so wherever it is read back.
    gemini: "Gemini (legacy)",
};

export const isClassifier = (value: unknown): value is Classifier =>
    typeof value === "string" &&
    (CLASSIFIERS as readonly string[]).includes(value);
