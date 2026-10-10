-- =============================================================================
-- Wunschplan: Rechte, Frist, Sperre, Bewertung, Benachrichtigungen, Mandanten.
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set jonas '00000000-0000-4000-a000-000000000002'
\set leyla '00000000-0000-4000-a000-000000000003'
\set mira  '00000000-0000-4000-a000-000000000004'
\set tom   '00000000-0000-4000-a000-000000000008'

-- Offener Plan (nächster Monat) und gesperrter Plan (aktueller Monat) auf Station 3A
\set open_period   'a0000000-0000-4000-a000-000000000002'
\set locked_period 'a0000000-0000-4000-a000-000000000001'

-- -----------------------------------------------------------------------------
-- Pflegekraft: eigenen Wunschplan einreichen und ändern
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p_start date := (select period_start from public.wish_periods where id = 'a0000000-0000-4000-a000-000000000002');
  v_sub   uuid;
  v_id    uuid;
  n       integer;
begin
  assert (select count(*) from public.wish_periods) = 2, 'nurse sees the published wish periods of her ward';
  assert (select count(*) from public.wish_entries) = 6, 'nurse sees her own wishes';

  v_sub := public.submit_wish_plan('a0000000-0000-4000-a000-000000000002', jsonb_build_array(
    jsonb_build_object('date', p_start + 4, 'type', 'free'),
    jsonb_build_object('date', p_start + 5, 'type', 'early', 'note', 'Kita'),
    jsonb_build_object('date', p_start + 11, 'type', 'night')), 'Danke!');

  assert (select count(*) from public.wish_entries where submission_id = v_sub) = 3, 'wishes replaced (removed days deleted)';
  assert (select status from public.wish_entries where submission_id = v_sub and wish_date = p_start + 4) = 'submitted', 'unchanged wish keeps status';
  assert (select note from public.wish_submissions where id = v_sub) = 'Danke!', 'general note stored';
  assert exists (select 1 from public.notifications where type = 'wish_plan_submitted' and recipient_id = auth.uid()),
    'employee receives a confirmation';

  -- "Bevorzugter Dienst" needs a concrete shift type
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002',
      jsonb_build_array(jsonb_build_object('date', p_start + 1, 'type', 'preferred')));
    raise exception 'preferred without shift type must fail';
  exception when check_violation then null;
  end;
  perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002',
    jsonb_build_array(jsonb_build_object('date', p_start + 1, 'type', 'preferred', 'shift_type_id', '60000000-0000-4000-a000-000000000002')));

  -- date outside of the period
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002',
      jsonb_build_array(jsonb_build_object('date', p_start - 1, 'type', 'free')));
    raise exception 'date outside period must fail';
  exception when check_violation then null;
  end;

  -- hospital limit: max. 8 × Wunschfrei
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002',
      (select jsonb_agg(jsonb_build_object('date', p_start + i, 'type', 'free')) from generate_series(0, 8) i));
    raise exception 'too many free wishes must fail';
  exception when invalid_parameter_value then null;
  end;

  -- locked period: view only
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000001', '[]'::jsonb);
    raise exception 'locked period must not accept changes';
  exception when invalid_parameter_value then null;
  end;

  -- no direct writes, no reviews, no period management
  begin
    insert into public.wish_entries (hospital_id, submission_id, period_id, employee_id, wish_date, preference_type)
    values ('10000000-0000-4000-a000-000000000001', v_sub, 'a0000000-0000-4000-a000-000000000002',
            '40000000-0000-4000-a000-000000000001', p_start + 20, 'free');
    raise exception 'direct insert must fail';
  exception when insufficient_privilege then null;
  end;
  select id into v_id from public.wish_entries where submission_id = v_sub limit 1;
  begin
    perform public.review_wishes(array[v_id], 'considered');
    raise exception 'nurse must not review';
  exception when insufficient_privilege then null;
  end;
  update public.wish_periods set status = 'locked' where id = 'a0000000-0000-4000-a000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'nurse cannot lock a period';
  begin
    perform public.get_scheduling_context('30000000-0000-4000-a000-000000000001', p_start, p_start + 27);
    raise exception 'nurse must not read the scheduling context';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Kolleginnen sehen fremde Wünsche nicht; Schichtleitung ist keine Planerin
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'jonas', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.wish_entries) = 0, 'colleague / shift lead sees no wishes of others';
  assert (select count(*) from public.wish_overview) = 0, 'overview is empty without wishes.view';
  assert (select count(*) from public.wish_submissions) = 0, 'no foreign submissions';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Änderungen nach Einreichung nur, wenn das Haus es erlaubt
-- -----------------------------------------------------------------------------
begin;
update public.wish_periods set allow_edit_after_submit = false where id = :'open_period';
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002', '[]'::jsonb);
    raise exception 'editing after submission must be blocked';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Stationsleitung: bewerten, sperren, wieder öffnen, neue Periode anlegen
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_ids    uuid[];
  v_period uuid;
  ctx      jsonb;
begin
  assert (select count(*) from public.wish_overview where period_id = 'a0000000-0000-4000-a000-000000000002') = 4,
    'scheduler sees all wishes of her ward';
  assert (select count(*) from public.wish_overview where first_name = 'Anna') = 6, 'overview carries names';

  select array_agg(id) into v_ids from public.wish_entries
   where period_id = 'a0000000-0000-4000-a000-000000000002' and preference_type = 'free';
  assert public.review_wishes(v_ids, 'considered', 'Passt') = 2, 'two wishes reviewed';
  assert (public.my_wish_scope() -> 'manage_unit_ids') ? '30000000-0000-4000-a000-000000000001', 'scope lists her ward';
  assert jsonb_array_length(public.my_wish_scope() -> 'manage_unit_ids') = 1, 'and only her ward';

  -- planning input for a future assistant
  ctx := public.get_scheduling_context('30000000-0000-4000-a000-000000000001',
           (select period_start from public.wish_periods where id = 'a0000000-0000-4000-a000-000000000002'),
           (select period_end from public.wish_periods where id = 'a0000000-0000-4000-a000-000000000002'));
  assert jsonb_array_length(ctx -> 'wishes') = 4, 'context contains wishes';
  assert jsonb_array_length(ctx -> 'employees') = 4, 'context contains ward members';

  -- suggestions are proposals only
  insert into public.schedule_suggestions (hospital_id, unit_id, period_start, period_end, generator, suggestion)
  values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', current_date, current_date + 27, 'rules', '{"entries": []}');
  begin
    insert into public.schedule_suggestions (hospital_id, unit_id, period_start, period_end, generator, suggestion, status)
    values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', current_date, current_date + 27, 'ai', '{}', 'accepted');
    raise exception 'a suggestion must never be created as accepted';
  exception when insufficient_privilege then null;
  end;

  -- lock → wishes locked
  update public.wish_periods set status = 'locked' where id = 'a0000000-0000-4000-a000-000000000002';
  assert (select count(*) from public.wish_entries where period_id = 'a0000000-0000-4000-a000-000000000002' and status = 'locked') = 2,
    'unreviewed wishes are locked, reviewed ones keep their status';

  -- reopen needs a future deadline
  begin
    update public.wish_periods set status = 'open', deadline_at = now() - interval '1 hour'
     where id = 'a0000000-0000-4000-a000-000000000002';
    raise exception 'reopen with past deadline must fail';
  exception when invalid_parameter_value then null;
  end;
  update public.wish_periods set status = 'open', deadline_at = now() + interval '2 days'
   where id = 'a0000000-0000-4000-a000-000000000002';
  assert (select count(*) from public.wish_entries where period_id = 'a0000000-0000-4000-a000-000000000002' and status = 'locked') = 0,
    'reopening unlocks the wishes';
  assert (select reopened_at is not null from public.wish_periods where id = 'a0000000-0000-4000-a000-000000000002'), 'reopen is stamped';

  -- create & open a new period for her ward
  insert into public.wish_periods (hospital_id, unit_id, period_start, period_end, deadline_at)
  values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
          (date_trunc('month', current_date) + interval '2 months')::date,
          (date_trunc('month', current_date) + interval '3 months - 1 day')::date,
          now() + interval '20 days')
  returning id into v_period;
  assert (select status from public.wish_periods where id = v_period) = 'draft', 'new periods start as draft';
  update public.wish_periods set status = 'open' where id = v_period;

  -- other ward / other hospital: not allowed
  begin
    insert into public.wish_periods (hospital_id, unit_id, period_start, period_end, deadline_at)
    values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002', current_date + 60, current_date + 80, now() + interval '20 days');
    raise exception 'foreign ward must fail';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  assert (select count(*) from public.notifications where type = 'wish_plan_reviewed'
            and recipient_id = '00000000-0000-4000-a000-000000000001') = 1, 'Anna gets ONE review notification';
  assert exists (select 1 from public.notifications where type = 'wish_plan_locked'
                   and recipient_id = '00000000-0000-4000-a000-000000000003'), 'ward is told about locking';
  assert exists (select 1 from public.notifications where type = 'wish_plan_opened'
                   and recipient_id = '00000000-0000-4000-a000-000000000002' and (payload ->> 'reopened')::boolean),
    'ward is told about reopening';
  assert exists (select 1 from public.audit_logs where table_name = 'wish_entries' and action = 'UPDATE'
                   and actor_id = '00000000-0000-4000-a000-000000000004'), 'reviews are audited';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Frist: Erinnerung an alle ohne Einreichung, automatische Sperre
-- -----------------------------------------------------------------------------
begin;
update public.wish_periods set deadline_at = now() + interval '2 days' where id = :'open_period';
do $$
declare
  r jsonb;
begin
  r := private.run_wish_plan_jobs();
  assert (r ->> 'reminded')::int = 1, 'one period reminded';
  assert exists (select 1 from public.notifications where type = 'wish_plan_deadline'
                   and recipient_id = '00000000-0000-4000-a000-000000000003'), 'Leyla (not submitted) is reminded';
  assert not exists (select 1 from public.notifications where type = 'wish_plan_deadline'
                       and recipient_id = '00000000-0000-4000-a000-000000000001'), 'Anna (submitted) is not reminded';
  r := private.run_wish_plan_jobs();
  assert (r ->> 'reminded')::int = 0, 'reminder is sent only once';

  update public.wish_periods set deadline_at = now() - interval '1 minute' where id = 'a0000000-0000-4000-a000-000000000002';
  r := private.run_wish_plan_jobs();
  assert (r ->> 'locked')::int = 1, 'expired period is locked automatically';
end $$;
rollback;

begin;
update public.wish_periods set deadline_at = now() - interval '1 minute' where id = :'open_period';
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002', '[]'::jsonb);
    raise exception 'submission after deadline must fail even before the lock job ran';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Mandantentrennung
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.wish_periods) = 0, 'no foreign wish periods';
  assert (select count(*) from public.wish_entries) = 0, 'no foreign wishes';
  assert (select count(*) from public.wish_plan_settings) = 0, 'no foreign settings';
  begin
    perform public.submit_wish_plan('a0000000-0000-4000-a000-000000000002', '[]'::jsonb);
    raise exception 'foreign hospital must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

\echo '  ✓ Wunschplan assertions passed'
