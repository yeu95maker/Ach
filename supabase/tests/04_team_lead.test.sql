-- =============================================================================
-- Team lead features: Aktuelles, history, open-shift interest, sick-leave cover
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set jonas '00000000-0000-4000-a000-000000000002'
\set mira  '00000000-0000-4000-a000-000000000004'
\set tom   '00000000-0000-4000-a000-000000000008'

-- -----------------------------------------------------------------------------
-- Aktuelles: Stationsleitung veröffentlicht eine Fortbildung, das Team wird benachrichtigt
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a uuid;
begin
  insert into public.announcements (hospital_id, unit_id, title, body, category, event_starts_at, event_ends_at, location, published_at)
  values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'Fortbildung Wundversorgung',
          'Bitte anmelden.', 'training', now() + interval '3 days', now() + interval '3 days 2 hours', 'Raum 1', now())
  returning id into a;

  assert (select author_id from public.announcements where id = a) = '00000000-0000-4000-a000-000000000004', 'author set by the server';
  begin
    insert into public.announcements (hospital_id, unit_id, title, body, event_starts_at, event_ends_at, published_at)
    values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'x', 'y', now() + interval '2 days', now() + interval '1 day', now());
    raise exception 'event ending before it starts must fail';
  exception when check_violation then null;
  end;
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.notifications
          where type = 'announcement' and payload ->> 'title' = 'Fortbildung Wundversorgung'
            and created_at > now() - interval '1 minute') = 3,
    'ward members (Anna, Jonas, Leyla) are notified, not the author';
end $$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.announcements where event_starts_at is not null) >= 4, 'nurse sees the events';
  begin
    insert into public.announcements (hospital_id, unit_id, title, body, published_at)
    values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'x', 'y', now());
    raise exception 'nurse must not publish';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- History: Anna looks back two years; archived rosters are read only
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  h record;
  n int;
begin
  assert public.get_my_history_start('40000000-0000-4000-a000-000000000001') = (date_trunc('month', current_date) - interval '24 months')::date,
    'history starts 24 months ago';

  select count(*) into n from public.get_my_shift_history('40000000-0000-4000-a000-000000000001',
    (date_trunc('month', current_date) - interval '24 months')::date, current_date);
  assert n = 25, 'one row per month';

  select * into h from public.get_my_shift_history('40000000-0000-4000-a000-000000000001',
    (date_trunc('month', current_date) - interval '5 months')::date, current_date)
  where month = (date_trunc('month', current_date) - interval '4 months')::date;
  assert h.shift_count between 10 and 24, 'shifts of that month (minus the vacation)';
  assert h.shift_minutes > 0 and (h.by_category ->> 'night')::int > 0, 'minutes and categories';
  assert h.vacation_days > 0, 'approved vacation counted';

  -- someone else's history stays empty
  select * into h from public.get_my_shift_history('40000000-0000-4000-a000-000000000003',
    (date_trunc('month', current_date) - interval '4 months')::date, current_date);
  assert h.shift_count = 0, 'no access to colleagues history';
end $$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
begin
  update public.schedule_entries set note = 'x'
   where schedule_id = '71000000-0000-4000-a000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'archived rosters are read only';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Open shift: Anna volunteers, Mira assigns
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  open_id uuid := (select id from public.schedule_entries
                   where schedule_id = '70000000-0000-4000-a000-000000000001' and employee_id is null limit 1);
  i public.open_shift_interests;
begin
  i := public.express_open_shift_interest(open_id, 'Ich kann!');
  assert i.status = 'pending' and i.employee_id = '40000000-0000-4000-a000-000000000001', 'interest stored';
  assert (select count(*) from public.open_shift_interests) = 1, 'nurse sees only her own interest';

  perform public.withdraw_open_shift_interest(open_id);
  assert (select status from public.open_shift_interests where id = i.id) = 'withdrawn', 'withdrawn';
  i := public.express_open_shift_interest(open_id, null);
  assert i.status = 'pending', 'can volunteer again';

  begin
    perform public.assign_shift(open_id, '40000000-0000-4000-a000-000000000001');
    raise exception 'nurse must not assign';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  assert exists (select 1 from public.notifications n join public.users u on u.id = n.recipient_id
                 where n.type = 'open_shift_interest' and u.email = 'mira.schulz@shiftcare.dev'), 'Stationsleitung notified';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  open_id uuid := (select id from public.schedule_entries
                   where schedule_id = '70000000-0000-4000-a000-000000000001' and employee_id is null limit 1);
  c record;
  e public.schedule_entries;
begin
  assert exists (select 1 from public.open_shift_interests where entry_id = open_id and employee_id = '40000000-0000-4000-a000-000000000001'), 'Mira sees the interest of her team';

  select * into c from public.get_shift_candidates(open_id) where employee_id = '40000000-0000-4000-a000-000000000001';
  assert c.interested, 'Anna marked as interested';

  select * into c from public.get_shift_candidates(open_id) where employee_id = '40000000-0000-4000-a000-000000000003';
  if c.absence is not null then
    assert not c.available, 'absent people are not available';
  end if;

  -- a busy colleague cannot take it (double booking is impossible)
  select * into c from public.get_shift_candidates(open_id) where not available and absence is null limit 1;
  if c.employee_id is not null then
    begin
      perform public.assign_shift(open_id, c.employee_id);
      raise exception 'overlapping assignment must fail';
    exception when exclusion_violation then null;
    end;
  end if;

  select * into c from public.get_shift_candidates(open_id) where available limit 1;
  e := public.assign_shift(open_id, c.employee_id);
  assert e.employee_id = c.employee_id, 'shift assigned to the first available candidate';
  assert not exists (select 1 from public.open_shift_interests where entry_id = open_id and status = 'pending'), 'interests resolved';
  assert (select count(*) from public.open_shift_interests where entry_id = open_id and status = 'accepted')
         = case when c.interested then 1 else 0 end, 'accepted only if the person had volunteered';

  begin
    perform public.assign_shift(open_id, '40000000-0000-4000-a000-000000000008');
    raise exception 'foreign employee must fail';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;

-- Tom (other hospital) cannot volunteer for Station 3A
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.express_open_shift_interest(
    (select id from public.schedule_entries where employee_id is null limit 1), null);
  raise exception 'foreign hospital must fail';
exception when insufficient_privilege or invalid_parameter_value then null;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Sick-leave cover: Leyla is sick → Mira finds cover for her shifts
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s     record;
  c     record;
  cover uuid;
  e     public.schedule_entries;
  n     int;
begin
  select count(*) into n from public.get_sick_leave_shifts('90000000-0000-4000-a000-000000000001');
  assert n >= 1, 'Leyla has shifts during her sick leave';
  select * into s from public.get_sick_leave_shifts('90000000-0000-4000-a000-000000000001') limit 1;

  assert not exists (select 1 from public.get_shift_candidates(s.entry_id) where employee_id = '40000000-0000-4000-a000-000000000003'),
    'the sick person is not a candidate';
  select count(*) into n from public.get_shift_candidates(s.entry_id);
  assert n = 3, 'Anna, Jonas, Mira are candidates';

  select employee_id into cover from public.get_shift_candidates(s.entry_id) where available limit 1;
  if cover is not null then
    e := public.assign_shift(s.entry_id, cover);
    assert e.employee_id = cover, 'cover assigned';
    assert not exists (select 1 from public.schedule_entries where employee_id = cover and entry_date = s.entry_date and kind = 'off'),
      'planned Frei of the cover is replaced';
  end if;

  select * into s from public.get_sick_leave_shifts('90000000-0000-4000-a000-000000000001') limit 1;
  assert s.entry_id is not null, 'a second shift is left to release';
  e := public.release_shift(s.entry_id);
  assert e.employee_id is null, 'released as open shift';
  perform set_config('test.released', e.id::text, true);
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.notifications
          where type = 'open_shift' and entity_id = current_setting('test.released')::uuid) >= 3,
    'ward is notified about the released shift';
end $$;
rollback;

-- A nurse cannot read the cover data
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.get_sick_leave_shifts('90000000-0000-4000-a000-000000000001');
  raise exception 'nurse must not see sick-leave shifts';
exception when insufficient_privilege then null;
end $$;
rollback;

\o
\echo '  ✓ Team-Leitung assertions passed'
