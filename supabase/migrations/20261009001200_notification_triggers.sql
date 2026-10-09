-- =============================================================================
-- ShiftCare · 1200 · Domain events → notifications
--
-- Notifications are produced inside the same transaction as the business
-- change (no lost events, no client involvement). A statement-level trigger
-- then queues one push delivery per registered device; the push-dispatch Edge
-- Function drains that queue (see supabase/functions/push-dispatch).
-- =============================================================================

create or replace function private.notify_users(
  p_hospital_id uuid,
  p_user_ids    uuid[],
  p_type        public.notification_type,
  p_payload     jsonb,
  p_entity_type text,
  p_entity_id   uuid
)
returns void
language sql volatile security definer
set search_path = ''
as $$
  insert into public.notifications (hospital_id, recipient_id, type, payload, entity_type, entity_id)
  select p_hospital_id, r.uid, p_type, coalesce(p_payload, '{}'::jsonb), p_entity_type, p_entity_id
  from (select distinct unnest(p_user_ids) as uid) r
  where r.uid is not null
    -- never notify the person who caused the event
    and r.uid is distinct from (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Schedule published → every employee with an entry in that roster
-- -----------------------------------------------------------------------------
create or replace function private.on_schedule_published()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published' or new.version <> old.version) then
    perform private.notify_users(
      new.hospital_id,
      array(
        select e.user_id from public.schedule_entries se
        join public.employees e on e.id = se.employee_id
        where se.schedule_id = new.id
      ),
      'schedule_published',
      jsonb_build_object(
        'schedule_id', new.id,
        'unit_name', (select u.name from public.units u where u.id = new.unit_id),
        'period_start', new.period_start,
        'period_end', new.period_end,
        'version', new.version),
      'schedule', new.id);
  end if;
  return null;
end;
$$;

create trigger schedules_notify_published
  after update of status, version on public.schedules
  for each row execute function private.on_schedule_published();

-- -----------------------------------------------------------------------------
-- Entry changed inside an already published roster → affected employee(s);
-- new open shift → all members of the ward.
-- -----------------------------------------------------------------------------
create or replace function private.on_schedule_entry_changed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  s        public.schedules;
  rec      public.schedule_entries := coalesce(new, old);
  affected uuid[];
begin
  select * into s from public.schedules where id = rec.schedule_id;
  if s.status <> 'published' then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.employee_id is not distinct from old.employee_id
     and new.kind is not distinct from old.kind
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at
     and new.entry_date = old.entry_date then
    return null;  -- only note changed
  end if;

  affected := array(
    select e.user_id from public.employees e
    where e.id in (
      case when tg_op in ('UPDATE', 'DELETE') then old.employee_id end,
      case when tg_op in ('UPDATE', 'INSERT') then new.employee_id end)
  );

  if array_length(affected, 1) > 0 then
    perform private.notify_users(
      s.hospital_id, affected, 'schedule_changed',
      jsonb_build_object('entry_date', rec.entry_date, 'schedule_id', s.id,
                         'unit_name', (select u.name from public.units u where u.id = s.unit_id)),
      'schedule_entry', rec.id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.employee_id is null and new.kind = 'shift'
     and (tg_op = 'INSERT' or old.employee_id is not null) then
    perform private.notify_users(
      s.hospital_id,
      array(
        select e.user_id from public.employee_units eu
        join public.employees e on e.id = eu.employee_id and e.status = 'active'
        where eu.unit_id = s.unit_id),
      'open_shift',
      jsonb_build_object('entry_date', new.entry_date, 'starts_at', new.starts_at, 'ends_at', new.ends_at,
                         'unit_name', (select u.name from public.units u where u.id = s.unit_id)),
      'schedule_entry', new.id);
  end if;

  return null;
end;
$$;

create trigger schedule_entries_notify_changed
  after insert or update or delete on public.schedule_entries
  for each row execute function private.on_schedule_entry_changed();

-- -----------------------------------------------------------------------------
-- Leave requests
-- -----------------------------------------------------------------------------
create or replace function private.on_leave_request_changed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name    text;
  v_payload jsonb;
begin
  select trim(u.first_name || ' ' || u.last_name) into v_name
  from public.employees e join public.users u on u.id = e.user_id where e.id = new.employee_id;

  v_payload := jsonb_build_object(
    'leave_type', new.leave_type, 'start_date', new.start_date, 'end_date', new.end_date,
    'employee_name', v_name);

  if tg_op = 'INSERT' then
    perform private.notify_users(
      new.hospital_id,
      array(select private.user_ids_with_permission_for_employee('leave.approve', new.employee_id)),
      'leave_requested', v_payload, 'leave_request', new.id);
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform private.notify_users(
      new.hospital_id,
      array(select e.user_id from public.employees e where e.id = new.employee_id),
      case when new.status = 'approved' then 'leave_approved' else 'leave_rejected' end::public.notification_type,
      v_payload || jsonb_build_object('decision_note', new.decision_note),
      'leave_request', new.id);
  end if;
  return null;
end;
$$;

create trigger leave_requests_notify
  after insert or update of status on public.leave_requests
  for each row execute function private.on_leave_request_changed();

-- -----------------------------------------------------------------------------
-- Sick leave: managers are informed; the employee is informed on processing.
-- The payload never contains the (encrypted) comment.
-- -----------------------------------------------------------------------------
create or replace function private.on_sick_leave_changed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select trim(u.first_name || ' ' || u.last_name) into v_name
  from public.employees e join public.users u on u.id = e.user_id where e.id = new.employee_id;

  if tg_op = 'INSERT' then
    perform private.notify_users(
      new.hospital_id,
      array(select private.user_ids_with_permission_for_employee('sick_leave.view', new.employee_id)),
      'sick_leave_reported',
      jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date, 'employee_name', v_name),
      'sick_leave', new.id);
  elsif new.status is distinct from old.status then
    perform private.notify_users(
      new.hospital_id,
      array(select e.user_id from public.employees e where e.id = new.employee_id),
      'sick_leave_updated',
      jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date, 'status', new.status),
      'sick_leave', new.id);
  end if;
  return null;
end;
$$;

create trigger sick_leaves_notify
  after insert or update of status on public.sick_leaves
  for each row execute function private.on_sick_leave_changed();

-- -----------------------------------------------------------------------------
-- Announcements: notify the audience when (first) published
-- -----------------------------------------------------------------------------
create or replace function private.on_announcement_published()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.published_at is not null and new.published_at <= now()
     and (tg_op = 'INSERT' or old.published_at is null) then
    perform private.notify_users(
      new.hospital_id,
      array(
        select distinct e.user_id from public.employees e
        where e.hospital_id = new.hospital_id and e.status = 'active'
          and (new.unit_id is null
               or e.id in (select eu.employee_id from public.employee_units eu where eu.unit_id = new.unit_id))),
      'announcement',
      jsonb_build_object('title', new.title, 'priority', new.priority),
      'announcement', new.id);
  end if;
  return null;
end;
$$;

create trigger announcements_notify
  after insert or update of published_at on public.announcements
  for each row execute function private.on_announcement_published();

-- -----------------------------------------------------------------------------
-- Push queue: one delivery per device of the recipient, unless the user
-- disabled push for that hospital (settings key 'notifications.push' = false).
-- Statement-level with a transition table → one INSERT per fan-out.
-- -----------------------------------------------------------------------------
create or replace function private.enqueue_push_deliveries()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notification_deliveries (notification_id, device_token_id, channel)
  select n.id, dt.id, 'push'
  from inserted n
  join public.device_tokens dt on dt.user_id = n.recipient_id
  where not exists (
    select 1 from public.settings st
    where st.hospital_id = n.hospital_id and st.user_id = n.recipient_id
      and st.key = 'notifications.push' and st.value = 'false'::jsonb);
  return null;
end;
$$;

create trigger notifications_enqueue_push
  after insert on public.notifications
  referencing new table as inserted
  for each statement execute function private.enqueue_push_deliveries();

-- Realtime: clients subscribe to their own notifications (RLS applies).
alter publication supabase_realtime add table public.notifications;
