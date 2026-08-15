-- migrate:up
-- Pinning a list, or saving the editor without changing anything, used to bump
-- updated_at because the trigger fired on every update of the row. That date is
-- shown as "Edited", so it has to track the fields a person actually edits.
drop trigger "lists_set_updated_at" on "lists";

create trigger "lists_set_updated_at" before update on "lists"
    for each row when (
        old."name" is distinct from new."name"
        or old."description" is distinct from new."description"
        or old."status" is distinct from new."status"
    ) execute function set_updated_at();

-- migrate:down
drop trigger "lists_set_updated_at" on "lists";

create trigger "lists_set_updated_at" before update on "lists"
    for each row execute function set_updated_at();
