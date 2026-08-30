-- migrate:up
alter table list_history_actions
    drop constraint list_history_actions_kind_check;

alter table list_history_actions
    add constraint list_history_actions_kind_check check (kind between 1 and 10);

-- migrate:down
-- A rollback cannot represent restore entries, so remove those entries before
-- reinstating the older constraint. The restored list data itself is retained.
delete from list_history_actions where kind = 10;

alter table list_history_actions
    drop constraint list_history_actions_kind_check;

alter table list_history_actions
    add constraint list_history_actions_kind_check check (kind between 1 and 9);
