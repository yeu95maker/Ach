-- =============================================================================
-- Dienstplan-Editor: set_schedule_cell()
-- =============================================================================
\o /dev/null
\set anna '00000000-0000-4000-a000-000000000001'
\set mira '00000000-0000-4000-a000-000000000004'
\set tom  '00000000-0000-4000-a000-000000000008'

-- Stationsleitung bearbeitet den Entwurf (nächster Monat) ihrer Station
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  d    date := (select period_start from public.schedules where id = '70000000-0000-4000-a000-000000000002') + 20;
  e1   public.schedule_entries;
  e2   public.schedule_entries;
begin
  -- Leyla has no entries in the draft yet
  e1 := public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d, 'shift', '60000000-0000-4000-a000-000000000001');
  assert e1.starts_at is not null and e1.ends_at > e1.starts_at, 'times derived from the shift type';

  e2 := public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d, 'shift', '60000000-0000-4000-a000-000000000002');
  assert e2.id = e1.id, 'changing a cell updates the entry in place';
  assert e2.starts_at <> e1.starts_at, 'times follow the new shift type';

  e2 := public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d, 'off');
  assert e2.kind = 'off' and e2.starts_at is null and e2.shift_type_id is null, 'cell set to Frei';

  perform public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d, null);
  assert not exists (select 1 from public.schedule_entries where employee_id = '40000000-0000-4000-a000-000000000003' and entry_date = d),
    'cell cleared';

  -- night shift followed by an early shift the next morning overlaps → rejected
  perform public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d, 'shift', '60000000-0000-4000-a000-000000000003');
  begin
    perform public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d + 1, 'shift', '60000000-0000-4000-a000-000000000001');
    raise exception 'overlapping shifts must fail';
  exception when exclusion_violation then null;
  end;

  -- a shift needs a shift type
  begin
    perform public.set_schedule_cell('70000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000003', d + 3, 'shift', null);
    raise exception 'shift without type must fail';
  exception when invalid_parameter_value then null;
  end;

  -- other hospital: roster invisible → refused
  begin
    perform public.set_schedule_cell('70000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000008', current_date, 'off');
    raise exception 'foreign roster must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Änderung im veröffentlichten Plan → genau EINE Benachrichtigung
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_entry public.schedule_entries;
begin
  select * into v_entry from public.schedule_entries
   where schedule_id = '70000000-0000-4000-a000-000000000001' and employee_id = '40000000-0000-4000-a000-000000000001' and kind = 'off'
   order by entry_date desc limit 1;
  perform public.set_schedule_cell(v_entry.schedule_id, v_entry.employee_id, v_entry.entry_date, 'shift', '60000000-0000-4000-a000-000000000002');
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.notifications where type = 'schedule_changed'
            and recipient_id = '00000000-0000-4000-a000-000000000001') = 1, 'one change, one notification';
end $$;
rollback;

-- Pflegekraft darf nicht planen
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.set_schedule_cell('70000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', current_date, 'off');
    raise exception 'nurse must not edit the roster';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '  ✓ Dienstplan-Editor assertions passed'
