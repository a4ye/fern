-- migrate:up

-- Which model reads the inbox. The two answer the same question and differ in
-- what they cost to ask: Jev returns a typed decision in about a sixth of a
-- second and charges for what it reads, Gemini writes its answer out a token at
-- a time and takes seconds per batch.
--
-- Jev is the default because it is the one measured to miss less. Over a
-- thousand messages of a real inbox it reported every status change that had
-- already been confirmed by hand, where the batching Gemini needs to stay
-- inside its own rate limits is what makes it slow enough to time a sync out.
-- Gemini stays available because Jev is a young service with one provider and
-- no way to run it anywhere else.
create type email_classifier as enum ('jev', 'gemini');

alter table "user_settings"
    add column "email_classifier" email_classifier not null default 'jev';

-- migrate:down
alter table "user_settings"
    drop column "email_classifier";

drop type email_classifier;
