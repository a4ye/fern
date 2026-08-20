// Every ceiling the app enforces, in one place so they can be read against each
// other and moved together. Nothing here is a target: each one is set where a
// season of real job hunting, however heavy, stays well underneath, and only
// something automated would ever meet it. Someone applying to a few thousand
// roles a cycle should never see any of these.
//
// Client and server both read this file, so it holds numbers and nothing else.

// How often one account may do a thing, counted in a window that restarts once
// it has passed. Each check is itself a write, so these cover the calls worth
// paying for: everything that mutates, and everything that spends money or
// someone else's quota. Plain reads are left alone.
//
// Windows are kept short deliberately. A ceiling of 240 an hour and one of 4 in
// a minute hold the same rate, but someone who meets the first waits an hour to
// be forgiven and someone who meets the second waits under a minute. Since none
// of these should be met by a person at all, the one that recovers quickly is
// the one to be wrong with.
export const RATE_LIMITS = {
    // Saving, deleting, moving, pinning. The table sends one request for a
    // whole selection and the detail panel one for a whole save, so a fast
    // hand doing bulk entry spends a few a minute. This allows four a second.
    write: { requests: 40, windowSeconds: 10 },

    // Reading a spreadsheet and committing it. Both parse or validate every row
    // in a file that may hold 10,000 of them. Migrating off another tracker
    // takes a few tries at the mapping, and each try spends two.
    import: { requests: 15, windowSeconds: 5 * 60 },

    // A Gmail read plus an LLM classification, which is the only thing here
    // that spends real money per call. Nothing syncs on its own: it is a button
    // someone presses, a handful of times a day at most.
    inbox: { requests: 5, windowSeconds: 15 * 60 },

    // Fetching a job posting from an employer's site, which happens when a link
    // is pasted and the extension is not there to read it in the browser
    // instead. One a second, which is faster than the form can be driven: a
    // paste has to be read, filled over and saved before the next one.
    scrapeUser: { requests: 60, windowSeconds: 60 },

    // Reporting what a paste did. The browser sends this because the two readers
    // worth knowing about, its own and the extension's, never reach this server
    // any other way. Set to match the paste it follows, since there is one
    // report per read and no report without a read that could have happened.
    metrics: { requests: 60, windowSeconds: 60 },

    // What every account together may ask of one provider in that same window,
    // which is what that provider actually sees coming from this app. This is
    // the only ceiling in the file that a crowd shares, so it is the only one
    // that gets tighter as the app gets busier.
    //
    // Ten a second, which is what Lever publishes as its steady state and the
    // only figure any of these providers puts in writing. Greenhouse documents
    // no limit for the board API this app reads, which is unauthenticated and
    // sits behind a CDN; Ashby documents none either. So this is set to the one
    // published number and applied to all of them, which is the most that can be
    // justified without guessing on someone else's behalf.
    //
    // Two things keep real traffic far below it: the 12 hour cache answers a
    // repeated link before either budget is touched, and someone running the
    // extension never reaches the server at all, since the posting is read in
    // their own browser. Workday is keyed per company rather than per provider,
    // so it never aggregates here at all.
    //
    // Being blocked by a provider takes the feature away from everyone at once
    // and is not something this app can undo, which is why this stays at a
    // published number rather than at whatever it could get away with.
    scrapeProvider: { requests: 600, windowSeconds: 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

// One account's share of the database. A list per season with a few thousand
// applications in it is a heavy year; these allow more than a decade of that.
export const MAX_LISTS = 100;
export const MAX_APPLICATIONS_PER_LIST = 10_000;
export const MAX_APPLICATIONS = 25_000;

// Recorded moves through the pipeline, per application. A job that went to four
// rounds records about eight, and the busiest row in this database has four.
// Forty is not a job hunt, and this is what stops one row from growing a history
// without end.
export const MAX_EVENTS_PER_APPLICATION = 40;

// What one page load will read, per application and per list. These are what
// keep the cost of opening a list bounded no matter what is in it, since a list
// read builds every application's trail to draw the chart.
//
// Both sit above the ceilings a write enforces, deliberately. A quota is checked
// and then written in two statements, so two requests racing can put a row or
// two past it; leaving headroom means such a row is still read back rather than
// quietly disappearing from someone's history. Nothing a person can create is
// ever hidden by these.
export const MAX_EVENTS_READ_PER_APPLICATION = 60;
export const MAX_APPLICATIONS_READ_PER_LIST = 10_100;

// How many applications one request may create, edit, or delete at once. The
// table can select every row it shows, so this has to clear a full list.
export const MAX_APPLICATION_BATCH = 2_000;

// Steps added or dropped in a single save from the detail panel.
export const MAX_STATUS_STEP_EDITS = 100;

// The write is one statement whatever the row count, so this is a ceiling on
// how much of someone's old tracker has to arrive in pieces, not on the
// database. The mapping step is what feels it: every row is re-read through the
// schema on each change to a column or a status.
export const MAX_IMPORT_ROWS = 10_000;

// Enough for the row count above with room to spare. A file of 10,000 rows
// exported from another tracker measures about 1.8 MB, and the same rows travel
// back up as roughly 2.6 MB of JSON when the import is committed. Both share the
// body a server action will carry, so serverActions.bodySizeLimit in
// next.config.ts has to stay above this and above that second figure.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const FILE_TOO_LARGE = "That file is larger than 5 MB.";

// What a caller is told when a budget above is spent. Deliberately vague about
// the window: the number is ours to tune, and someone who has met it is either
// automating or has hit a bug worth hearing about.
export const TOO_MANY_REQUESTS =
    "You are doing that too quickly. Wait a moment and try again.";
