-- =============================================================================
-- ShiftCare · Dienstplan-Editor
--
-- set_schedule_cell(): sets exactly one cell (employee × day) of a roster.
--   * SECURITY INVOKER → the schedule_entries RLS policies decide who may edit
--     (schedule.manage on the ward, roster not archived).
--   * Updates an existing entry in place instead of delete + insert, so an
--     edit in a published roster produces ONE "Dienst geändert" notification.
--   * p_kind NULL clears the cell.
--   * Overlapping shifts are rejected by the exclusion constraint (23P01).
-- =============================================================================

create or replace function public.set_schedule_cell(
  p_schedule_id   uuid,
  p_employee_id   uuid,
  p_date          date,
  p_kind          public.schedule_entry_kind,
  p_shift_type_id uuid default null
)
returns public.schedule_entries
language plpgsql volatile
set search_path = ''
as $$
declare
  v_hospital uuid;
  v_existing public.schedule_entries;
  v_result   public.schedule_entries;
begin
  select s.hospital_id into v_hospital from public.schedules s where s.id = p_schedule_id;
  if v_hospital is null then
    raise exception 'Unknown roster' using errcode = '42501';
  end if;
  if p_kind = 'shift' and p_shift_type_id is null then
    raise exception 'A shift needs a shift type' using errcode = '22023';
  end if;

  -- One cell = one entry per employee and day (all rows of that day are replaced).
  select * into v_existing
  from public.schedule_entries
  where schedule_id = p_schedule_id and employee_id = p_employee_id and entry_date = p_date
  order by created_at
  limit 1
  for update;

  delete from public.schedule_entries
  where schedule_id = p_schedule_id and employee_id = p_employee_id and entry_date = p_date
    and id is distinct from v_existing.id;

  if p_kind is null then
    delete from public.schedule_entries where id = v_existing.id;
    return null;
  end if;

  if v_existing.id is not null then
    update public.schedule_entries
       set kind          = p_kind,
           shift_type_id = case when p_kind = 'shift' then p_shift_type_id end,
           starts_at     = null,   -- recomputed from the shift type by the prepare trigger
           ends_at       = null,
           note          = case when p_kind = 'shift' and v_existing.shift_type_id = p_shift_type_id then v_existing.note end
     where id = v_existing.id
    returning * into v_result;
  else
    insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date)
    values (v_hospital, p_schedule_id, p_employee_id, p_kind, case when p_kind = 'shift' then p_shift_type_id end, p_date)
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.set_schedule_cell(uuid, uuid, date, public.schedule_entry_kind, uuid) from public, anon;
grant execute on function public.set_schedule_cell(uuid, uuid, date, public.schedule_entry_kind, uuid) to authenticated;

