-- =============================================================================
-- Demo-Daten verlängern (nur Demo-Projekt, nie Produktion)
--
-- Sorgt dafür, dass die Demo-Stationen vom aktuellen Monat bis :until einen
-- veröffentlichten Dienstplan haben (Rotation F F S S N N –, durchgehend ab
-- 01.10.2026, also nie N → F). Der Monat danach liegt als Entwurf für den
-- Dienstplan-Editor bereit, dazu ein offener Wunschplan und je ein offener
-- Dienst pro Monat (für „Offene Dienste“). Bestehende Einträge bleiben;
-- es wird nur ergänzt. Urlaub und Krankheit werden ausgespart.
--
-- Ausführen im Supabase SQL Editor (Demo-Projekt). Ende anpassen:
--   Zeile „v_until“ unten, z. B. date '2027-05-31'.
-- =============================================================================
do $$
declare
  v_until  date := date '2027-02-28';            -- veröffentlicht bis einschließlich
  v_anchor date := date '2026-10-01';            -- Start der Rotation
  v_lead   uuid := '00000000-0000-4000-a000-000000000004'; -- Mira Schulz (Leitung 3A)
  v_rot    text[] := array['F','F','S','S','N','N','-'];
  v_month  date;
  v_end    date;
  v_sched  uuid;
  v_draft  date;
  u        record;
begin
  v_draft := (date_trunc('month', v_until) + interval '1 month')::date;
  -- no "Dienst geändert" notification storm for generated rows
  perform set_config('shiftcare.bulk_import', 'on', true);

  create temp table _staff (hospital_id uuid, unit_id uuid, employee_id uuid, offset_days int, in_draft boolean) on commit drop;
  insert into _staff values
    ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', 0, true),  -- Anna
    ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', 2, false), -- Jonas
    ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', 4, true),  -- Leyla
    ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000004', 1, false), -- Mira
    ('10000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000004', '40000000-0000-4000-a000-000000000008', 3, false),
    ('10000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000004', '40000000-0000-4000-a000-000000000009', 0, false);

  for u in select distinct hospital_id, unit_id from _staff loop
    v_month := date_trunc('month', current_date)::date;
    while v_month <= v_draft loop
      -- the extra draft month only for Station 3A (editor demo)
      exit when v_month = v_draft and u.unit_id <> '30000000-0000-4000-a000-000000000001';
      v_end := (v_month + interval '1 month - 1 day')::date;

      select id into v_sched from public.schedules
       where unit_id = u.unit_id and period_start = v_month and status <> 'archived';
      if v_sched is null then
        insert into public.schedules (hospital_id, unit_id, period_start, period_end, status, version)
        values (u.hospital_id, u.unit_id, v_month, v_end, 'draft', 0)
        returning id into v_sched;
      end if;

      -- keep the rotation continuous: drafts are realigned (manual edits in drafts are overwritten)
      if (select status from public.schedules where id = v_sched) = 'draft' then
        -- two steps: the no-double-booking constraint is checked row by row
        update public.schedule_entries e
           set kind = 'off', shift_type_id = null, starts_at = null, ends_at = null
         where e.schedule_id = v_sched and e.employee_id in (select employee_id from _staff where unit_id = u.unit_id);
        update public.schedule_entries e
           set kind = case when x.code = '-' then 'off' else 'shift' end::public.schedule_entry_kind,
               shift_type_id = (select t.id from public.shift_types t where t.hospital_id = u.hospital_id and t.code = x.code)
          from (select e2.id, v_rot[((e2.entry_date - v_anchor + st.offset_days) % 7) + 1] as code
                  from public.schedule_entries e2
                  join _staff st on st.employee_id = e2.employee_id and st.unit_id = u.unit_id
                 where e2.schedule_id = v_sched) x
         where x.id = e.id;
      end if;

      insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date)
      select u.hospital_id, v_sched, st.employee_id,
             case when c.code = '-' then 'off' else 'shift' end::public.schedule_entry_kind,
             (select t.id from public.shift_types t where t.hospital_id = u.hospital_id and t.code = c.code),
             d.day
        from _staff st
        cross join lateral (select g::date as day from generate_series(v_month, v_end, interval '1 day') g) d
        cross join lateral (select v_rot[((d.day - v_anchor + st.offset_days) % 7) + 1] as raw) r
        -- an early shift right after an existing night shift (older plans with another rotation) would overlap → day off
        cross join lateral (select case when r.raw = 'F' and exists (
                                  select 1 from public.schedule_entries p
                                    join public.shift_types pt on pt.id = p.shift_type_id
                                   where p.employee_id = st.employee_id and p.entry_date = d.day - 1 and pt.code = 'N')
                                then '-' else r.raw end as code) c
       where st.unit_id = u.unit_id
         and (v_month < v_draft or st.in_draft)
         and not exists (select 1 from public.schedule_entries e
                          where e.schedule_id = v_sched and e.employee_id = st.employee_id and e.entry_date = d.day)
         and not exists (select 1 from public.leave_requests lr
                          where lr.employee_id = st.employee_id and lr.status = 'approved'
                            and d.day between lr.start_date and lr.end_date)
         and not exists (select 1 from public.sick_leaves sl
                          where sl.employee_id = st.employee_id and sl.status <> 'cancelled'
                            and d.day between sl.start_date and sl.end_date);

      -- one open late shift per month on Station 3A ("Springer gesucht")
      if u.unit_id = '30000000-0000-4000-a000-000000000001' and v_month < v_draft
         and not exists (select 1 from public.schedule_entries where schedule_id = v_sched and employee_id is null) then
        insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date, note)
        values (u.hospital_id, v_sched, null, 'shift', '60000000-0000-4000-a000-000000000002',
                least(greatest(v_month + 6, current_date + 3), v_end)::date, 'Springer gesucht');
      end if;

      if v_month < v_draft then
        update public.schedules
           set status = 'published', version = greatest(version, 1),
               published_at = coalesce(published_at, now()), published_by = coalesce(published_by, v_lead)
         where id = v_sched and status = 'draft';
      end if;
      v_sched := null;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;

  -- Wunschplan for the draft month, open for wishes
  if not exists (select 1 from public.wish_periods
                  where unit_id = '30000000-0000-4000-a000-000000000001' and period_start = v_draft and status <> 'archived') then
    insert into public.wish_periods (hospital_id, unit_id, period_start, period_end, deadline_at)
    values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
            v_draft, (v_draft + interval '1 month - 1 day')::date, (v_draft - interval '20 days')::date + time '18:00');
    update public.wish_periods set status = 'open'
     where unit_id = '30000000-0000-4000-a000-000000000001' and period_start = v_draft and status = 'draft'
       and deadline_at > now();
  end if;
end;
$$;

-- Überblick
select u.name, s.period_start, s.status, count(e.id) as entries, count(e.id) filter (where e.employee_id is null) as open_shifts
  from public.schedules s
  join public.units u on u.id = s.unit_id
  left join public.schedule_entries e on e.schedule_id = s.id
 where s.period_end >= date_trunc('month', current_date) and s.status <> 'archived'
 group by u.name, s.period_start, s.status
 order by u.name, s.period_start;
