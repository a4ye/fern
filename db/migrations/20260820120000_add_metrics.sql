-- migrate:up

-- What the app does, counted rather than logged. Page analytics can see that
-- someone opened a list; only this can see whether the link they pasted filled
-- the form in, which of the three readers got there first, or whether the status
-- change the model proposed was one they took.
--
-- A row is a day, a name and a bucket, and it holds a count and a sum. There is
-- no user, no URL, no company and no message in it, so nothing here can be tied
-- back to a person or a posting, and there is nothing to prune: a year of the
-- app running adds a few thousand rows, not a few million.
--
-- What this costs is resolution. A rollup can answer "how long did the average
-- read take" but never "how long did that one take", so a metric worth a
-- percentile has to spend a bucket on the range instead. That trade is made
-- deliberately: an event log answers questions nobody has asked, forever.
create table "metrics" (
    "day"    date not null,
    "metric" text not null,
    "bucket" text not null,
    "count"  bigint not null,
    -- The measure that belongs with the count: milliseconds waited, rows
    -- imported, fields filled. Zero where the count is the whole story. Kept
    -- beside the count so a mean is a division rather than a second table.
    "total"  bigint not null,
    primary key ("day", "metric", "bucket")
);

-- No further index. Reports read a whole metric across every day, which is a
-- scan of a table that grows by a few rows a day, and the primary key is what
-- the recording upsert needs.

-- migrate:down
drop table "metrics";
