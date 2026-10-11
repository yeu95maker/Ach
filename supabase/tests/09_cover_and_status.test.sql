-- =============================================================================
-- Einspringen 2.0 (targeted open-shift notifications) + Stationsstatus
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set mira  '00000000-0000-4000-a000-000000000004'
\set hanna '00000000-0000-4000-a000-000000000006'
\set tom   '00000000-0000-4000-a000-000000000008'

create temp table _cov (k text primary key, v text);
grant all on _cov to authenticated;

-- A published early shift of Anna, 10–20 days ahead; Jonas is sick that day.
do $$
declare
  e public.schedule_entries;
begin
  select se.* into e
  from public.schedule_entries se
  join public.schedules s on s.id = se.schedule_id and s.status = 'published' and s.unit_id = '30000000-0000-4000-a000-000000000001'
  where se.employee_id = '40000000-0000-4000-a000-000000000001' and se.kind = 'shift'
    and se.entry_date between current_date + 10 and current_date + 20
  order by se.entry_date limit 1;
  assert e.id is not null, 'fixture: a future shift of Anna';
  insert into _cov values ('entry', e.id::text), ('date', e.entry_date::text);
  delete from public.sick_leaves where employee_id = '40000000-0000-4000-a000-000000000002' and e.entry_date between start_date and end_date;
  insert into public.sick_leaves (hospital_id, employee_id, start_date, end_date, status)
  values ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', e.entry_date, e.entry_date, 'acknowledged');
  delete from public.notifications where type = 'open_shift';
end;
$$;

-- Mira releases it: only suitable colleagues are notified
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.release_shift((select v::uuid from _cov where k = 'entry'));
end;
$$;
commit;

do $$
declare
  entry uuid := (select v::uuid from _cov where k = 'entry');
  members int;
  notified int;
begin
  select count(*) into notified from public.notifications where type = 'open_shift' and entity_id = entry;
  select count(*) into members from public.employee_units eu join public.employees e on e.id = eu.employee_id and e.status = 'active'
   where eu.unit_id = '30000000-0000-4000-a000-000000000001';
  assert not exists (select 1 from public.notifications where type = 'open_shift' and entity_id = entry
                      and recipient_id = '00000000-0000-4000-a000-000000000002'), 'Jonas is sick and is not asked';
  assert notified < members, format('targeted (%s of %s members)', notified, members);
  -- every recipient really is a suitable candidate
  assert not exists (
    select 1 from public.notifications n
    join public.employees e on e.user_id = n.recipient_id and e.hospital_id = n.hospital_id
    join private.cover_candidates(entry) c on c.employee_id = e.id
    where n.type = 'open_shift' and n.entity_id = entry and not (c.available and c.rest_ok)), 'only available colleagues with enough rest';
  assert (select payload ->> 'targeted' from public.notifications where type = 'open_shift' and entity_id = entry limit 1) = 'true'
    or notified = 0, 'payload marks targeted notifications';
end;
$$;

-- The lead's candidate list is the same logic, and still requires the right
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform * from public.get_shift_candidates((select v::uuid from _cov where k = 'entry'));
    raise exception 'nurses cannot list candidates';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

-- Stationsstatus
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  d date := (select v::date from _cov where k = 'date');
  st jsonb;
  early jsonb;
begin
  st := public.get_ward_status('30000000-0000-4000-a000-000000000001', d);
  assert st ->> 'unit_name' = 'Station 3A · Kardiologie', 'ward';
  assert (st ->> 'sick')::int >= 1, 'Jonas counted as sick';
  assert st -> 'leave' = 'null'::jsonb, 'nurses do not see leave counts';
  select x into early from jsonb_array_elements(st -> 'shifts') x where x ->> 'code' = 'F';
  assert (early ->> 'min_staff')::int = 1, 'requirement from staffing_requirements';
  assert (early ->> 'open')::int >= 1, 'the released shift is open';
  assert (st ->> 'open_shifts')::int >= 1, 'open shifts summed';
  assert jsonb_typeof(st -> 'understaffed') = 'boolean', 'understaffed flag';
  assert (st ->> 'date')::date = d, 'date';
  assert public.get_ward_status('30000000-0000-4000-a000-000000000001') ->> 'date' is not null, 'defaults to today';
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert public.get_ward_status('30000000-0000-4000-a000-000000000001', (select v::date from _cov where k = 'date')) -> 'leave' <> 'null'::jsonb,
    'the ward lead sees the leave count';
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.get_ward_status('30000000-0000-4000-a000-000000000001', current_date);
    raise exception 'other hospital must not see the ward status';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

\o
\echo '  ✓ Einspringen / Stationsstatus assertions passed'
