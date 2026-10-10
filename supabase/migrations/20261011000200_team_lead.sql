-- =============================================================================
-- ShiftCare · Team lead features (decided 11.10.2026)
--
--   1. "Aktuelles": announcements get a category (Fortbildung, Teamsitzung,
--      Arztgespräch, Weiterbildung, Workshop, Information …) and optional
--      event date/time and location.
--   2. Shift history: archived rosters stay readable, so everybody can look
--      back at their own shifts for years.
--   3. Open shifts: staff can register interest; ward management assigns.
--   4. Sick-leave cover: ward management sees who could take over a shift
--      (free that day, not absent, rest time respected, wishes) and assigns
--      the shift or releases it as an open shift.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Aktuelles
-- -----------------------------------------------------------------------------
alter table public.announcements
  add column category        public.announcement_category not null default 'information',
  add column event_starts_at timestamptz,
  add column event_ends_at   timestamptz,
  add column location        text check (char_length(location) <= 200),
  add constraint announcements_event_period_check
    check (event_ends_at is null or (event_starts_at is not null and event_ends_at >= event_starts_at));

comment on column public.announcements.event_starts_at is
  'Date/time of the event (Fortbildung, Teamsitzung …). NULL = plain information.';

create index announcements_events_idx on public.announcements (hospital_id, event_starts_at)
  where event_starts_at is not null;

grant insert (category, event_starts_at, event_ends_at, location) on public.announcements to authenticated;
grant update (category, event_starts_at, event_ends_at, location) on public.announcements to authenticated;

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
          and e.user_id is distinct from new.author_id
          and (new.unit_id is null
               or e.id in (select eu.employee_id from public.employee_units eu where eu.unit_id = new.unit_id))),
      'announcement',
      jsonb_build_object('title', new.title, 'priority', new.priority, 'category', new.category,
                         'event_starts_at', new.event_starts_at),
      'announcement', new.id);
  end if;
  return null;
end;
$$;

-- Where may the caller publish? NULL unit = whole hospital.
create or replace function public.my_announcement_targets()
returns table (hospital_id uuid, unit_id uuid, unit_name text)
language sql stable security definer
set search_path = ''
as $$
  select t.hospital_id, t.unit_id, t.unit_name
  from (
    select h as hospital_id, null::uuid as unit_id, null::text as unit_name, 0 as sort
    from private.hospitals_with_permission('announcements.publish') h
    union all
    select u.hospital_id, u.id, u.name, 1
    from public.units u
    where u.is_active and u.id in (select private.units_with_permission('announcements.publish'))
  ) t
  order by t.sort, t.unit_name
$$;

revoke execute on function public.my_announcement_targets() from public, anon;
grant execute on function public.my_announcement_targets() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. History: archived rosters remain visible (read only).
-- -----------------------------------------------------------------------------
drop policy schedules_select on public.schedules;
create policy schedules_select on public.schedules
  for select to authenticated
  using (
    (status in ('published', 'archived') and hospital_id in (select private.hospitals_with_any_permission('schedule.view')))
    or unit_id in (select private.units_with_permission('schedule.view_drafts'))
  );

-- Monthly summary of the caller's own shifts and absences.
-- SECURITY INVOKER: RLS decides what is visible (own entries, own absences).
create or replace function public.get_my_shift_history(p_employee_id uuid, p_from date, p_to date)
returns table (
  month         date,
  shift_count   integer,
  shift_minutes integer,
  by_category   jsonb,
  vacation_days integer,
  sick_days     integer
)
language sql stable
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  ),
  shifts as (
    select date_trunc('month', se.entry_date)::date as month,
           coalesce(st.category::text, 'other') as category,
           -- same rule as the roster view: planned time from start to end
           extract(epoch from (se.ends_at - se.starts_at))::integer / 60 as minutes
    from public.schedule_entries se
    join public.schedules s on s.id = se.schedule_id and s.status in ('published', 'archived')
    left join public.shift_types st on st.id = se.shift_type_id
    where se.employee_id = p_employee_id
      and se.employee_id in (select private.my_employee_ids())
      and se.kind = 'shift'
      and se.entry_date between p_from and p_to
  ),
  absence_days as (
    select date_trunc('month', d)::date as month, 'vacation' as kind
    from public.leave_requests lr, generate_series(lr.start_date, lr.end_date, interval '1 day') d
    where lr.employee_id = p_employee_id and lr.status = 'approved'
      and lr.employee_id in (select private.my_employee_ids())
      and d::date between p_from and p_to and extract(isodow from d) < 6
    union all
    select date_trunc('month', d)::date, 'sick'
    from public.sick_leaves sl, generate_series(sl.start_date, sl.end_date, interval '1 day') d
    where sl.employee_id = p_employee_id and sl.status <> 'cancelled'
      and sl.employee_id in (select private.my_employee_ids())
      and d::date between p_from and p_to
  )
  select
    m.month,
    (select count(*)::integer from shifts s where s.month = m.month),
    (select coalesce(sum(s.minutes), 0)::integer from shifts s where s.month = m.month),
    coalesce((select jsonb_object_agg(c.category, c.n)
              from (select s.category, count(*) as n from shifts s where s.month = m.month group by s.category) c), '{}'::jsonb),
    (select count(*)::integer from absence_days a where a.month = m.month and a.kind = 'vacation'),
    (select count(*)::integer from absence_days a where a.month = m.month and a.kind = 'sick')
  from months m
  order by m.month desc
$$;

-- First month with data for the caller (start of the history year picker).
create or replace function public.get_my_history_start(p_employee_id uuid)
returns date
language sql stable
set search_path = ''
as $$
  select min(se.entry_date)
  from public.schedule_entries se
  join public.schedules s on s.id = se.schedule_id and s.status in ('published', 'archived')
  where se.employee_id = p_employee_id
    and se.employee_id in (select private.my_employee_ids())
$$;

revoke execute on function public.get_my_shift_history(uuid, date, date), public.get_my_history_start(uuid) from public, anon;
grant execute on function public.get_my_shift_history(uuid, date, date), public.get_my_history_start(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Interest in open shifts
-- -----------------------------------------------------------------------------
create table public.open_shift_interests (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null,
  entry_id    uuid not null,
  employee_id uuid not null,
  note        text check (char_length(note) <= 300),
  status      public.open_shift_interest_status not null default 'pending',
  decided_by  uuid references public.users (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (entry_id, employee_id),
  foreign key (hospital_id, entry_id)    references public.schedule_entries (hospital_id, id) on delete cascade,
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id)        on delete cascade
);

comment on table public.open_shift_interests is
  '"Ich kann einspringen": interest of an employee in an open shift. Written only through RPCs.';

create index open_shift_interests_employee_idx on public.open_shift_interests (employee_id, created_at desc);

create trigger open_shift_interests_set_updated_at
  before update on public.open_shift_interests
  for each row execute function private.set_updated_at();

alter table public.open_shift_interests enable row level security;
grant select on public.open_shift_interests to authenticated;

-- Own interests, and all interests for wards the caller manages.
create policy open_shift_interests_select on public.open_shift_interests
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or entry_id in (
      select se.id from public.schedule_entries se
      join public.schedules s on s.id = se.schedule_id
      where s.unit_id in (select private.units_with_permission('schedule.manage')))
  );

create trigger open_shift_interests_audit
  after insert or update or delete on public.open_shift_interests
  for each row execute function private.audit_row();

create or replace function public.express_open_shift_interest(p_entry_id uuid, p_note text default null)
returns public.open_shift_interests
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_entry  public.schedule_entries;
  v_sched  public.schedules;
  v_emp    uuid;
  v_result public.open_shift_interests;
begin
  select * into v_entry from public.schedule_entries where id = p_entry_id;
  select * into v_sched from public.schedules where id = v_entry.schedule_id;
  if v_entry.id is null or v_entry.employee_id is not null or v_entry.kind <> 'shift'
     or v_sched.status <> 'published' or v_entry.starts_at <= now() then
    raise exception 'This shift is not open' using errcode = '22023';
  end if;

  select e.id into v_emp
  from public.employees e
  join public.employee_units eu on eu.employee_id = e.id and eu.unit_id = v_sched.unit_id
  where e.id in (select private.my_employee_ids()) and e.hospital_id = v_sched.hospital_id
  limit 1;
  if v_emp is null then
    raise exception 'Only members of the ward can volunteer' using errcode = '42501';
  end if;
  if exists (select 1 from public.schedule_entries o
             where o.employee_id = v_emp and o.kind = 'shift'
               and tstzrange(o.starts_at, o.ends_at) && tstzrange(v_entry.starts_at, v_entry.ends_at)) then
    raise exception 'You already work at that time' using errcode = '23P01';
  end if;

  insert into public.open_shift_interests (hospital_id, entry_id, employee_id, note)
  values (v_entry.hospital_id, p_entry_id, v_emp, nullif(btrim(p_note), ''))
  on conflict (entry_id, employee_id) do update
    set status = 'pending', note = excluded.note, decided_by = null, decided_at = null
  returning * into v_result;

  perform private.notify_users(
    v_entry.hospital_id,
    array(
      select distinct holder.user_id
      from public.employee_roles er
      join public.role_permissions rp on rp.role_id = er.role_id and rp.permission_key = 'schedule.manage'
      join public.employees holder on holder.id = er.employee_id and holder.status = 'active'
      join public.units u on u.id = v_sched.unit_id
      where er.hospital_id = v_entry.hospital_id
        and (er.valid_until is null or er.valid_until > now())
        and (er.unit_id = u.id or er.department_id = u.department_id
             or (er.unit_id is null and er.department_id is null))
        and holder.id <> v_emp),
    'open_shift_interest',
    jsonb_build_object(
      'entry_date', v_entry.entry_date, 'starts_at', v_entry.starts_at, 'ends_at', v_entry.ends_at,
      'unit_name', (select u.name from public.units u where u.id = v_sched.unit_id),
      'employee_name', (select btrim(u.first_name || ' ' || u.last_name)
                        from public.employees e join public.users u on u.id = e.user_id where e.id = v_emp)),
    'schedule_entry', p_entry_id);

  return v_result;
end;
$$;

create or replace function public.withdraw_open_shift_interest(p_entry_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.open_shift_interests
     set status = 'withdrawn'
   where entry_id = p_entry_id
     and employee_id in (select private.my_employee_ids())
     and status = 'pending';
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Assign / release shifts (sick-leave cover and open shifts)
-- -----------------------------------------------------------------------------
create or replace function private.manageable_entry(p_entry_id uuid)
returns public.schedule_entries
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_entry public.schedule_entries;
  v_sched public.schedules;
begin
  select * into v_entry from public.schedule_entries where id = p_entry_id;
  select * into v_sched from public.schedules where id = v_entry.schedule_id;
  if v_entry.id is null or v_sched.status = 'archived'
     or not private.has_unit_permission('schedule.manage', v_sched.unit_id) then
    raise exception 'Not allowed to change this shift' using errcode = '42501';
  end if;
  if v_entry.kind <> 'shift' then
    raise exception 'Only shifts can be assigned' using errcode = '22023';
  end if;
  return v_entry;
end;
$$;

-- Who could take over this shift? One row per active member of the ward.
create or replace function public.get_shift_candidates(p_entry_id uuid)
returns table (
  employee_id        uuid,
  first_name         text,
  last_name          text,
  avatar_path        text,
  job_title          text,
  available          boolean,   -- no absence and no overlapping shift
  absence            text,      -- 'vacation' | 'sick' | null
  busy_shift_code    text,      -- other shift that day (makes the person unavailable)
  planned_off        boolean,   -- "Frei" planned that day
  rest_ok            boolean,   -- ≥ 11 h rest before and after
  rest_before_hours  numeric,
  rest_after_hours   numeric,
  wish_type          text,      -- wish for that day (free, unavailable, early …)
  interested         boolean,   -- volunteered for this (open) shift
  month_shift_count  integer,
  month_minutes      integer
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_entry public.schedule_entries := private.manageable_entry(p_entry_id);
  v_sched public.schedules;
begin
  select * into v_sched from public.schedules where id = v_entry.schedule_id;

  return query
  with members as (
    select e.id, u.first_name, u.last_name, u.avatar_path, e.job_title
    from public.employee_units eu
    join public.employees e on e.id = eu.employee_id and e.status = 'active'
    join public.users u on u.id = e.user_id
    where eu.unit_id = v_sched.unit_id
      and e.id is distinct from v_entry.employee_id
  ),
  facts as (
    select
      m.*,
      (select case when exists (
                select 1 from public.sick_leaves sl
                where sl.employee_id = m.id and sl.status <> 'cancelled'
                  and v_entry.entry_date between sl.start_date and sl.end_date) then 'sick'
              when exists (
                select 1 from public.leave_requests lr
                where lr.employee_id = m.id and lr.status = 'approved'
                  and v_entry.entry_date between lr.start_date and lr.end_date) then 'vacation'
         end) as absence,
      (select coalesce(st.code, 'D') from public.schedule_entries o
       left join public.shift_types st on st.id = o.shift_type_id
       where o.employee_id = m.id and o.kind = 'shift' and o.id <> v_entry.id
         and tstzrange(o.starts_at, o.ends_at) && tstzrange(v_entry.starts_at, v_entry.ends_at)
       limit 1) as busy_code,
      exists (select 1 from public.schedule_entries o
              where o.employee_id = m.id and o.kind = 'off' and o.entry_date = v_entry.entry_date) as planned_off,
      (select max(o.ends_at) from public.schedule_entries o
       where o.employee_id = m.id and o.kind = 'shift' and o.ends_at <= v_entry.starts_at
         and o.ends_at > v_entry.starts_at - interval '3 days') as prev_end,
      (select min(o.starts_at) from public.schedule_entries o
       where o.employee_id = m.id and o.kind = 'shift' and o.starts_at >= v_entry.ends_at
         and o.starts_at < v_entry.ends_at + interval '3 days') as next_start,
      (select we.preference_type from public.wish_entries we
       where we.employee_id = m.id and we.wish_date = v_entry.entry_date
       order by we.created_at desc limit 1) as wish,
      exists (select 1 from public.open_shift_interests i
              where i.entry_id = v_entry.id and i.employee_id = m.id and i.status = 'pending') as interested,
      (select count(*)::integer from public.schedule_entries o
       where o.employee_id = m.id and o.kind = 'shift'
         and date_trunc('month', o.entry_date) = date_trunc('month', v_entry.entry_date)) as n_shifts,
      (select coalesce(sum(extract(epoch from (o.ends_at - o.starts_at)) / 60), 0)::integer
       from public.schedule_entries o
       where o.employee_id = m.id and o.kind = 'shift'
         and date_trunc('month', o.entry_date) = date_trunc('month', v_entry.entry_date)) as n_minutes
    from members m
  )
  select
    f.id, f.first_name, f.last_name, f.avatar_path, f.job_title,
    (f.absence is null and f.busy_code is null),
    f.absence,
    f.busy_code,
    f.planned_off,
    (coalesce(v_entry.starts_at - f.prev_end, interval '99 hours') >= interval '11 hours'
     and coalesce(f.next_start - v_entry.ends_at, interval '99 hours') >= interval '11 hours'),
    round(extract(epoch from (v_entry.starts_at - f.prev_end)) / 3600, 1),
    round(extract(epoch from (f.next_start - v_entry.ends_at)) / 3600, 1),
    f.wish,
    f.interested,
    f.n_shifts,
    f.n_minutes
  from facts f
  order by
    (f.absence is null and f.busy_code is null) desc,
    f.interested desc,
    (coalesce(v_entry.starts_at - f.prev_end, interval '99 hours') >= interval '11 hours'
     and coalesce(f.next_start - v_entry.ends_at, interval '99 hours') >= interval '11 hours') desc,
    (f.wish in ('free', 'unavailable')) nulls first,
    f.n_minutes,
    f.last_name;
end;
$$;

-- Gives the shift to another employee (or takes it over from a sick colleague).
-- A planned "Frei" of the new person on that day is replaced; pending interests
-- are resolved. Notifications go out through the schedule-entry trigger.
create or replace function public.assign_shift(p_entry_id uuid, p_employee_id uuid)
returns public.schedule_entries
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_entry  public.schedule_entries := private.manageable_entry(p_entry_id);
  v_unit   uuid;
  v_result public.schedule_entries;
begin
  select s.unit_id into v_unit from public.schedules s where s.id = v_entry.schedule_id;
  if not exists (
    select 1 from public.employee_units eu
    join public.employees e on e.id = eu.employee_id and e.status = 'active'
    where eu.employee_id = p_employee_id and eu.unit_id = v_unit) then
    raise exception 'The employee is not a member of this ward' using errcode = '22023';
  end if;

  delete from public.schedule_entries
  where employee_id = p_employee_id and entry_date = v_entry.entry_date and kind = 'off';

  update public.schedule_entries
     set employee_id = p_employee_id
   where id = p_entry_id
  returning * into v_result;

  update public.open_shift_interests
     set status = case when employee_id = p_employee_id then 'accepted' else 'declined' end::public.open_shift_interest_status,
         decided_by = (select auth.uid()),
         decided_at = now()
   where entry_id = p_entry_id and status = 'pending';

  return v_result;
end;
$$;

-- Makes the shift an open shift (e.g. no cover found yet). Ward members are
-- notified by the trigger and can register interest.
create or replace function public.release_shift(p_entry_id uuid)
returns public.schedule_entries
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_entry  public.schedule_entries := private.manageable_entry(p_entry_id);
  v_result public.schedule_entries;
begin
  update public.schedule_entries
     set employee_id = null
   where id = v_entry.id
  returning * into v_result;
  return v_result;
end;
$$;

-- Shifts of an employee within a sick leave period (for the cover workflow).
create or replace function public.get_sick_leave_shifts(p_sick_leave_id uuid)
returns table (
  entry_id      uuid,
  schedule_id   uuid,
  unit_id       uuid,
  unit_name     text,
  entry_date    date,
  starts_at     timestamptz,
  ends_at       timestamptz,
  shift_code    text,
  shift_name    text,
  shift_category public.shift_category,
  schedule_status public.schedule_status
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_sl public.sick_leaves;
begin
  select * into v_sl from public.sick_leaves where id = p_sick_leave_id;
  if v_sl.id is null or not private.has_employee_permission('sick_leave.view', v_sl.employee_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  select se.id, se.schedule_id, s.unit_id, u.name, se.entry_date, se.starts_at, se.ends_at,
         st.code, st.name, st.category, s.status
  from public.schedule_entries se
  join public.schedules s on s.id = se.schedule_id and s.status <> 'archived'
  join public.units u on u.id = s.unit_id
  left join public.shift_types st on st.id = se.shift_type_id
  where se.employee_id = v_sl.employee_id
    and se.kind = 'shift'
    and se.entry_date between v_sl.start_date and v_sl.end_date
    and se.ends_at > now()
    and s.unit_id in (select private.units_with_permission('schedule.manage'))
  order by se.starts_at;
end;
$$;

revoke execute on function
  public.express_open_shift_interest(uuid, text), public.withdraw_open_shift_interest(uuid),
  public.get_shift_candidates(uuid), public.assign_shift(uuid, uuid), public.release_shift(uuid),
  public.get_sick_leave_shifts(uuid)
  from public, anon;
grant execute on function
  public.express_open_shift_interest(uuid, text), public.withdraw_open_shift_interest(uuid),
  public.get_shift_candidates(uuid), public.assign_shift(uuid, uuid), public.release_shift(uuid),
  public.get_sick_leave_shifts(uuid)
  to authenticated;
revoke execute on function private.manageable_entry(uuid) from public, anon;
grant execute on function private.manageable_entry(uuid) to authenticated;
