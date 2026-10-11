-- =============================================================================
-- Pulshift · Einspringen 2.0 + Stationsstatus
--
-- * Open shifts notify only suitable colleagues (same rules as "Wer kann
--   übernehmen?": no absence, no overlapping shift, ≥ 11 h rest, no wish
--   "not available"). The candidate logic moves to private.cover_candidates()
--   so the notification and the lead's list always agree.
-- * Volunteering ("Ich kann einspringen") and the lead's one-tap confirmation
--   use the existing express_open_shift_interest / assign_shift.
-- * get_ward_status(): staffing of a ward for one day, for everyone on the ward.
-- =============================================================================

create or replace function private.cover_candidates(p_entry_id uuid)
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
  v_entry public.schedule_entries;
  v_sched public.schedules;
begin
  select * into v_entry from public.schedule_entries where id = p_entry_id;
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
revoke execute on function private.cover_candidates(uuid) from public, anon, authenticated;

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
begin
  perform private.manageable_entry(p_entry_id);
  return query select * from private.cover_candidates(p_entry_id);
end;
$$;

create or replace function private.suitable_cover_user_ids(p_entry_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.user_id
  from private.cover_candidates(p_entry_id) c
  join public.employees e on e.id = c.employee_id
  where c.available and c.rest_ok and c.wish_type is distinct from 'unavailable'
$$;
revoke execute on function private.suitable_cover_user_ids(uuid) from public, anon, authenticated;

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
  if current_setting('shiftcare.bulk_import', true) = 'on' then
    return null;
  end if;

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
    return null;  -- only note / provenance changed
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
      -- Einspringen 2.0: only colleagues who can actually take it (free, no absence,
      -- rest period kept, no "not available" wish) – not the whole ward.
      array(select private.suitable_cover_user_ids(new.id)),
      'open_shift',
      jsonb_build_object('entry_date', new.entry_date, 'starts_at', new.starts_at, 'ends_at', new.ends_at,
                         'unit_name', (select u.name from public.units u where u.id = s.unit_id), 'targeted', true),
      'schedule_entry', new.id);
  end if;

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stationsstatus: staffing of one ward on one day (published roster)
--   shifts[]: per shift type – planned, open, min/target from staffing_requirements
--   sick: people of the ward on sick leave that day (count only)
--   leave: people on approved leave (count; only for those allowed to see leave)
-- -----------------------------------------------------------------------------
create or replace function public.get_ward_status(p_unit_id uuid, p_date date default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_unit   public.units;
  v_tz     text;
  v_date   date;
  v_shifts jsonb;
  v_sick   integer;
  v_leave  integer;
begin
  select * into v_unit from public.units where id = p_unit_id;
  if v_unit.id is null or not (
       p_unit_id in (select private.my_unit_ids())
    or p_unit_id in (select private.units_with_permission('schedule.view_drafts'))
    or p_unit_id in (select private.units_with_permission('schedule.manage'))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select h.timezone into v_tz from public.hospitals h where h.id = v_unit.hospital_id;
  v_date := coalesce(p_date, (now() at time zone coalesce(v_tz, 'Europe/Berlin'))::date);

  with entries as (
    select se.shift_type_id, se.employee_id
    from public.schedule_entries se
    join public.schedules s on s.id = se.schedule_id and s.status = 'published' and s.unit_id = p_unit_id
    where se.entry_date = v_date and se.kind = 'shift'
  ),
  req as (
    select r.shift_type_id, max(r.min_staff) as min_staff, max(r.target_staff) as target_staff
    from public.staffing_requirements r
    where r.unit_id = p_unit_id
      and (r.weekday is null or r.weekday = extract(isodow from v_date))
      and (r.valid_from is null or r.valid_from <= v_date)
      and (r.valid_to is null or r.valid_to >= v_date)
    group by r.shift_type_id
  ),
  types as (
    select shift_type_id from entries where shift_type_id is not null
    union
    select shift_type_id from req
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'shift_type_id', st.id, 'code', st.code, 'name', st.name, 'category', st.category,
           'start_time', st.start_time, 'end_time', st.end_time,
           'planned', (select count(*) from entries e where e.shift_type_id = st.id and e.employee_id is not null),
           'open',    (select count(*) from entries e where e.shift_type_id = st.id and e.employee_id is null),
           'min_staff', rq.min_staff, 'target_staff', rq.target_staff)
         order by st.sort_order, st.start_time), '[]'::jsonb)
    into v_shifts
  from types t
  join public.shift_types st on st.id = t.shift_type_id
  left join req rq on rq.shift_type_id = st.id;

  select count(distinct sl.employee_id) into v_sick
  from public.sick_leaves sl
  join public.employee_units eu on eu.employee_id = sl.employee_id and eu.unit_id = p_unit_id
  where sl.status in ('reported', 'acknowledged') and v_date between sl.start_date and sl.end_date;

  if p_unit_id in (select private.units_with_permission('leave.view')) then
    select count(distinct lr.employee_id) into v_leave
    from public.leave_requests lr
    join public.employee_units eu on eu.employee_id = lr.employee_id and eu.unit_id = p_unit_id
    where lr.status = 'approved' and v_date between lr.start_date and lr.end_date;
  end if;

  return jsonb_build_object(
    'unit_id', v_unit.id, 'unit_name', v_unit.name, 'date', v_date,
    'shifts', v_shifts,
    'sick', v_sick,
    'leave', v_leave,
    'open_shifts', (select coalesce(sum((x ->> 'open')::int), 0) from jsonb_array_elements(v_shifts) x),
    'understaffed', exists (select 1 from jsonb_array_elements(v_shifts) x
                            where x ->> 'min_staff' is not null and (x ->> 'planned')::int < (x ->> 'min_staff')::int));
end;
$$;

revoke execute on function public.get_ward_status(uuid, date) from public, anon;
grant execute on function public.get_ward_status(uuid, date) to authenticated;
