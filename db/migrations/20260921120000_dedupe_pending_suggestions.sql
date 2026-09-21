-- migrate:up

-- A company sends several emails about one decision: the offer, the paperwork,
-- the reminder. Each was read on its own and each asked the user the same
-- question, so only the clearest one is kept and the rest are dropped. They
-- carry nothing the kept row does not, and an answered row is left alone.
delete from email_suggestions
where id in (
    select id
    from (
        select
            id,
            row_number() over (
                partition by application_id, suggested_status
                order by confidence desc, email_received_at, id
            ) as rank
        from email_suggestions
        where state = 'pending'
    ) ranked
    where ranked.rank > 1
);

-- One pending review per move, however many emails announced it. Answering a
-- review takes it out of this index, so a later email can raise the same move
-- again once the user has dealt with it.
create unique index "email_suggestions_pending_move_key"
    on "email_suggestions" ("application_id", "suggested_status")
    where "state" = 'pending';

-- migrate:down

drop index "email_suggestions_pending_move_key";
