-- =============================================================================
-- ShiftCare · 0900 · Settings & audit log
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings: typed key/value store
--   user_id NULL      → hospital-wide setting   (e.g. 'leave.min_notice_days')
--   user_id NOT NULL  → per-user setting in that hospital (e.g. 'notifications.push')
-- -----------------------------------------------------------------------------
create table public.settings (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  user_id     uuid references public.users (id) on delete cascade,
  key         text not null check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  value       jsonb not null,
  updated_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (hospital_id, user_id, key)
);

create index settings_user_idx on public.settings (user_id) where user_id is not null;

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- Written exclusively by the private.audit_row() trigger. Nobody – not even a
-- hospital admin – can update or delete entries through the API.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  hospital_id    uuid references public.hospitals (id) on delete cascade,
  actor_id       uuid,                       -- auth.uid(); no FK so entries survive user deletion
  actor_role     text not null default current_user,
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name     text not null,
  record_id      text,
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only change history of security-relevant tables. Sensitive columns are masked.';

create index audit_logs_hospital_time_idx on public.audit_logs (hospital_id, created_at desc);
create index audit_logs_record_idx        on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx         on public.audit_logs (actor_id, created_at desc);

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  masked  text[] := array['comment_encrypted', 'web_push_keys', 'token'];
  k       text;
  changed text[];
begin
  foreach k in array masked loop
    if old_row ? k then old_row := jsonb_set(old_row, array[k], to_jsonb('***'::text)); end if;
    if new_row ? k then new_row := jsonb_set(new_row, array[k], to_jsonb('***'::text)); end if;
  end loop;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into changed
    from jsonb_each(new_row) n
    where n.value is distinct from old_row -> n.key
      and n.key not in ('updated_at');
    if changed is null then
      return null;  -- no-op update, nothing to log
    end if;
  end if;

  insert into public.audit_logs (hospital_id, actor_id, action, table_name, record_id, changed_fields, old_data, new_data)
  values (
    case
      when tg_table_name = 'hospitals' then coalesce(new_row, old_row) ->> 'id'
      else coalesce(new_row, old_row) ->> 'hospital_id'
    end::uuid,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(coalesce(new_row, old_row) ->> 'id',
             coalesce(new_row, old_row) ->> 'employee_id',
             coalesce(new_row, old_row) ->> 'role_id'),
    changed,
    old_row,
    new_row
  );
  return null;
end;
$$;

-- Attach the audit trigger to all security / HR relevant tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'hospitals', 'departments', 'units', 'employees', 'employee_units', 'employee_roles',
    'roles', 'role_permissions', 'qualifications', 'employee_qualifications', 'shift_types', 'schedules',
    'schedule_entries', 'leave_requests', 'sick_leaves', 'announcements', 'documents', 'settings'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.audit_row()',
      t || '_audit', t);
  end loop;
end;
$$;
