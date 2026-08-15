-- migrate:up
-- A list's edit time represents changes to its contents as well as its own
-- metadata. Keeping this in the database covers every application write path,
-- including imports and future callers that do not go through a server action.
create function touch_application_list_updated_at() returns trigger as $$
begin
    if tg_op = 'DELETE' then
        update lists set updated_at = now() where id = old.list_id;
    elsif tg_op = 'UPDATE' then
        update lists
        set updated_at = now()
        where id = old.list_id or id = new.list_id;
    else
        update lists set updated_at = now() where id = new.list_id;
    end if;

    return null;
end;
$$ language plpgsql;

create trigger "applications_touch_list_updated_at"
    after insert or update or delete on "applications"
    for each row execute function touch_application_list_updated_at();

-- migrate:down
drop trigger "applications_touch_list_updated_at" on "applications";
drop function touch_application_list_updated_at();
