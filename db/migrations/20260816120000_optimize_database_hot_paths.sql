-- migrate:up
-- Touch each affected list once per application statement. The previous row
-- trigger rewrote the same list hundreds or thousands of times during imports
-- and bulk edits.
drop trigger "applications_touch_list_updated_at" on "applications";
drop function touch_application_list_updated_at();

create function touch_application_lists_after_insert() returns trigger as $$
begin
    update lists
    set updated_at = now()
    where id in (select distinct list_id from new_rows);
    return null;
end;
$$ language plpgsql;

create function touch_application_lists_after_update() returns trigger as $$
begin
    update lists
    set updated_at = now()
    where id in (
        select list_id from old_rows
        union
        select list_id from new_rows
    );
    return null;
end;
$$ language plpgsql;

create function touch_application_lists_after_delete() returns trigger as $$
begin
    update lists
    set updated_at = now()
    where id in (select distinct list_id from old_rows);
    return null;
end;
$$ language plpgsql;

create trigger "applications_touch_lists_after_insert"
    after insert on applications
    referencing new table as new_rows
    for each statement execute function touch_application_lists_after_insert();

create trigger "applications_touch_lists_after_update"
    after update on applications
    referencing old table as old_rows new table as new_rows
    for each statement execute function touch_application_lists_after_update();

create trigger "applications_touch_lists_after_delete"
    after delete on applications
    referencing old table as old_rows
    for each statement execute function touch_application_lists_after_delete();

-- Match the list-detail filter and ordering so large lists do not require an
-- explicit sort after reading all matching application rows.
create index "applications_list_created_position_idx"
    on applications (list_id, created_at desc, position desc);

-- The overview's default order pins lists first, then uses their edit time.
create index "lists_user_pinned_recent_idx"
    on lists (user_id, (pinned_at is not null) desc, updated_at desc);

-- Support the bounded opportunistic cleanup performed after inbox sync.
create index "email_suggestions_resolved_created_idx"
    on email_suggestions (created_at)
    where state <> 'pending';

-- Take the per-user and shared-provider import budgets atomically in one round
-- trip. The nested block rolls the user debit back if the provider is already
-- exhausted, while advisory locks keep concurrent first-use inserts serialized.
create function take_job_import_budgets(
    p_user_scope_key text,
    p_provider_scope_key text,
    p_provider_request_cost integer,
    p_window_seconds integer,
    p_user_request_limit integer,
    p_provider_request_limit integer
) returns boolean as $$
declare
    user_count integer;
    provider_count integer;
    user_lock bigint := hashtextextended(p_user_scope_key, 0);
    provider_lock bigint := hashtextextended(p_provider_scope_key, 0);
begin
    perform pg_advisory_xact_lock(least(user_lock, provider_lock));
    perform pg_advisory_xact_lock(greatest(user_lock, provider_lock));

    begin
        insert into job_import_rate_limits (
            scope_key,
            window_started_at,
            request_count
        )
        values (p_user_scope_key, current_timestamp, 1)
        on conflict (scope_key) do update
        set
            window_started_at = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then current_timestamp
                else job_import_rate_limits.window_started_at
            end,
            request_count = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then 1
                else job_import_rate_limits.request_count + 1
            end
        where job_import_rate_limits.window_started_at
                <= current_timestamp
                    - (p_window_seconds * interval '1 second')
            or job_import_rate_limits.request_count + 1
                <= p_user_request_limit
        returning request_count into user_count;

        if user_count is null then
            return false;
        end if;

        insert into job_import_rate_limits (
            scope_key,
            window_started_at,
            request_count
        )
        values (
            p_provider_scope_key,
            current_timestamp,
            p_provider_request_cost
        )
        on conflict (scope_key) do update
        set
            window_started_at = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then current_timestamp
                else job_import_rate_limits.window_started_at
            end,
            request_count = case
                when job_import_rate_limits.window_started_at
                    <= current_timestamp
                        - (p_window_seconds * interval '1 second')
                then p_provider_request_cost
                else job_import_rate_limits.request_count
                    + p_provider_request_cost
            end
        where job_import_rate_limits.window_started_at
                <= current_timestamp
                    - (p_window_seconds * interval '1 second')
            or job_import_rate_limits.request_count
                + p_provider_request_cost <= p_provider_request_limit
        returning request_count into provider_count;

        if provider_count is null then
            raise exception 'provider import budget exhausted'
                using errcode = 'P0001';
        end if;

        return true;
    exception when sqlstate 'P0001' then
        return false;
    end;
end;
$$ language plpgsql;

-- migrate:down
drop function take_job_import_budgets(text, text, integer, integer, integer, integer);
drop index "email_suggestions_resolved_created_idx";
drop index "lists_user_pinned_recent_idx";
drop index "applications_list_created_position_idx";

drop trigger "applications_touch_lists_after_delete" on applications;
drop trigger "applications_touch_lists_after_update" on applications;
drop trigger "applications_touch_lists_after_insert" on applications;
drop function touch_application_lists_after_delete();
drop function touch_application_lists_after_update();
drop function touch_application_lists_after_insert();

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
    after insert or update or delete on applications
    for each row execute function touch_application_list_updated_at();
