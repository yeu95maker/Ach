-- =============================================================================
-- Integration Hub: staging, mapping, validation, diff, idempotent apply,
-- publish, tenant isolation, permissions, secrets, retries
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set mira  '00000000-0000-4000-a000-000000000004'
\set admin '00000000-0000-4000-a000-000000000007'
\set tom   '00000000-0000-4000-a000-000000000008'
\set lisa  '00000000-0000-4000-a000-000000000009'

-- Rows as the browser adapter sends them (month after next: no roster exists yet)
create temporary table t_import as
select (date_trunc('month', current_date) + interval '2 months')::date as p_start,
       (date_trunc('month', current_date) + interval '3 months - 1 day')::date as p_end;
grant select on t_import to authenticated;

create or replace function pg_temp.rows(variant text default 'base') returns jsonb language sql as $$
  select jsonb_agg(x order by (x ->> 'row_no')::int) from (
    select jsonb_build_object('row_no', 1, 'employee_ref', 'P-1001', 'employee_label', 'Becker, Anna', 'date', p_start + 0, 'code', 'F') x from t_import
    union all select jsonb_build_object('row_no', 2, 'employee_ref', 'P-1001', 'employee_label', 'Becker, Anna', 'date', p_start + 1,
                       'code', case when variant = 'changed' then 'S' else 'F' end) from t_import
    union all select jsonb_build_object('row_no', 3, 'employee_ref', 'P-1002', 'employee_label', 'Weber, Jonas', 'date', p_start + 0,
                       'code', 'N', 'start', '21:45', 'end', '06:15') from t_import
    union all select jsonb_build_object('row_no', 4, 'employee_ref', 'P-1002', 'employee_label', 'Weber, Jonas', 'date', p_start + 2, 'code', 'X') from t_import
    union all select jsonb_build_object('row_no', 5, 'employee_ref', 'EXT-77', 'employee_label', 'Yılmaz, Leyla', 'date', p_start + 0, 'code', 'S') from t_import
    union all select jsonb_build_object('row_no', 6, 'employee_ref', 'P-1001', 'employee_label', 'Becker, Anna', 'date', p_start + 3, 'code', 'FD') from t_import
    union all select jsonb_build_object('row_no', 7, 'employee_ref', 'P-1001', 'employee_label', 'Becker, Anna', 'date', p_start + 4, 'code', null) from t_import
    union all select jsonb_build_object('row_no', 8, 'employee_ref', 'P-1001', 'employee_label', 'Becker, Anna', 'date', p_start + 0, 'code', 'F') from t_import
    union all select jsonb_build_object('row_no', 9, 'employee_ref', 'P-1004', 'employee_label', 'Schulz, Mira', 'date', p_start + 40, 'code', 'F') from t_import
      where variant <> 'clean'
    union all select jsonb_build_object('row_no', 10, 'employee_ref', 'P-1004', 'employee_label', 'Schulz, Mira', 'date', p_start + 5, 'code', 'F') from t_import
      where variant <> 'removed'
  ) q
$$;

-- -----------------------------------------------------------------------------
-- 1. Stage, resolve, map, apply, re-import, publish (Stationsleitung 3A)
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  p     t_import;
  run   public.import_runs;
  run2  public.import_runs;
  prev  jsonb;
  r     public.import_rows;
  n     int;
  wishes int := (select count(*) from public.wish_entries);
begin
  select * into p from t_import;
  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                             p.p_start, p.p_end, 'dienstplan.csv', repeat('a', 64), 'list', '{}', pg_temp.rows());
  assert run.status = 'staged', 'staged';
  assert (run.summary ->> 'total')::int = 10, 'all rows stored';

  -- personnel number → employee; never by name
  select * into r from public.import_rows where run_id = run.id and row_no = 1;
  assert r.employee_id = '40000000-0000-4000-a000-000000000001' and r.employee_match = 'personnel_number', 'matched by personnel number';
  select * into r from public.import_rows where run_id = run.id and row_no = 5;
  assert r.employee_id is null and r.status = 'error' and r.messages @> '[{"code":"employee_unmatched"}]', 'unknown ID is not guessed from the name';

  -- night shift across midnight
  select * into r from public.import_rows where run_id = run.id and row_no = 3;
  assert r.ends_at - r.starts_at = interval '8 hours 30 minutes' and r.ends_at::date > r.entry_date, 'night shift ends next day';

  -- unknown codes, empty cell, duplicate, outside period
  assert (select status from public.import_rows where run_id = run.id and row_no = 4) = 'error', 'unknown code X';
  assert (select messages @> '[{"code":"unknown_code"}]' from public.import_rows where run_id = run.id and row_no = 6), 'unknown code FD';
  assert (select status from public.import_rows where run_id = run.id and row_no = 7) = 'ignored', 'empty cell ignored';
  assert (select messages @> '[{"code":"duplicate_row"}]' from public.import_rows where run_id = run.id and row_no = 8), 'duplicate row ignored';
  assert (select messages @> '[{"code":"outside_period"}]' from public.import_rows where run_id = run.id and row_no = 9), 'outside period';
  assert (run.summary ->> 'unknown_codes')::int = 2 and (run.summary ->> 'unmatched_employees')::int = 1, 'summary counts';

  -- applying with errors is refused
  begin
    perform public.apply_import(run.id);
    raise exception 'apply with errors must fail';
  exception when invalid_parameter_value then null;
  end;

  -- fix: map codes and the unknown employee; these mappings are reused later
  perform public.map_shift_code('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'FD',
                                'shift', '60000000-0000-4000-a000-000000000001');
  perform public.map_shift_code('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'X', 'off');
  perform public.confirm_employee_mapping('c0000000-0000-4000-a000-000000000001', 'EXT-77', '40000000-0000-4000-a000-000000000003');
  begin
    perform public.map_shift_code('c0000000-0000-4000-a000-000000000001', null, 'Q', 'off');
    raise exception 'hospital-wide mapping needs integrations.manage';
  exception when insufficient_privilege then null;
  end;

  run := public.revalidate_import(run.id);
  assert (run.summary ->> 'errors')::int = 1, 'only the out-of-period row is left';

  -- re-stage without the out-of-period row
  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                             p.p_start, p.p_end, 'dienstplan.csv', repeat('b', 64), 'list', '{}', pg_temp.rows('clean'));
  assert (run.summary ->> 'errors')::int = 0, 'clean file: no errors';
  assert (select employee_match from public.import_rows where run_id = run.id and row_no = 5) = 'mapping', 'confirmed mapping reused';
  assert (select target from public.import_rows where run_id = run.id and row_no = 4) = 'off', 'code mapping reused';

  prev := public.preview_import(run.id);
  assert prev -> 'schedule' = 'null'::jsonb, 'no roster yet';
  assert (prev -> 'counts' ->> 'added')::int = 7, 'seven entries to add';

  run := public.apply_import(run.id);
  assert run.status = 'applied' and run.schedule_id is not null, 'applied';
  assert (select status from public.schedules where id = run.schedule_id) = 'draft', 'new roster is a draft';
  assert (select count(*) from public.schedule_entries where schedule_id = run.schedule_id) = 7, 'seven entries written';
  assert (select count(*) from public.schedule_entries where schedule_id = run.schedule_id and import_key is not null and source_id is not null) = 7,
    'provenance stored';

  -- retry of the same call is rejected, nothing duplicated
  begin
    perform public.apply_import(run.id);
    raise exception 'second apply must fail';
  exception when object_not_in_prerequisite_state then null;
  end;

  -- same file again: duplicate detected, nothing changes
  run2 := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                              p.p_start, p.p_end, 'dienstplan.csv', repeat('b', 64), 'list', '{}', pg_temp.rows('clean'));
  assert run2.duplicate_of = run.id, 'duplicate upload recognised';
  prev := public.preview_import(run2.id);
  assert (prev -> 'counts' ->> 'unchanged')::int = 7 and (prev -> 'counts' ->> 'added')::int = 0, 'no changes';
  run2 := public.apply_import(run2.id);
  assert (select count(*) from public.schedule_entries where schedule_id = run.schedule_id) = 7, 'still seven entries – idempotent';

  -- publish (existing RPC) → runs published, raw data purged
  perform public.publish_schedule(run.schedule_id);
  assert (select status from public.import_runs where id = run2.id) = 'published', 'run marked published';
  assert not exists (select 1 from public.import_rows where run_id in (run.id, run2.id) and (raw is not null or employee_label is not null)),
    'file content purged after publishing';

  -- changed + removed shift on the published roster
  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                             p.p_start, p.p_end, 'dienstplan_v2.csv', repeat('c', 64), 'list', '{}', pg_temp.rows('changed'));
  -- a second, older upload of the same period is still staged
  run2 := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                              p.p_start, p.p_end, 'alt.csv', repeat('d', 64), 'list', '{}', pg_temp.rows('clean'));
  -- (variant 'changed' keeps row 9 out of period → drop it by re-staging the corrected file)
  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                             p.p_start, p.p_end, 'dienstplan_v3.csv', repeat('e', 64), 'list', '{}',
                             (select jsonb_agg(x) from jsonb_array_elements(pg_temp.rows('changed')) x where (x ->> 'row_no')::int not in (9, 10)));
  prev := public.preview_import(run.id);
  assert (prev -> 'counts' ->> 'changed')::int = 1, 'one changed shift';
  assert (prev -> 'counts' ->> 'removed')::int = 1, 'one removed shift';

  delete from public.notifications;  -- only count what this apply sends
  run := public.apply_import(run.id);
  assert run.status = 'applied', 'changes applied';
  assert (select code from public.shift_types where id = (
            select shift_type_id from public.schedule_entries where schedule_id = run.schedule_id
              and employee_id = '40000000-0000-4000-a000-000000000001' and entry_date = p.p_start + 1)) = 'S', 'F → S';
  assert not exists (select 1 from public.schedule_entries where schedule_id = run.schedule_id
                       and employee_id = '40000000-0000-4000-a000-000000000004'), 'removed shift deleted';
  assert (select status from public.import_runs where id = run2.id) = 'superseded', 'older staged upload superseded';
  assert (select count(*) from public.wish_entries) = wishes, 'wishes untouched';
  assert jsonb_array_length(public.list_import_runs('10000000-0000-4000-a000-000000000001')) >= 5, 'history lists the runs';
  assert (public.list_import_runs('10000000-0000-4000-a000-000000000001') -> 0 ->> 'created_by_name') = 'Mira Schulz', 'with the responsible person';
end $$;
reset role;
do $$
begin
  -- one summary notification per affected person (Anna: changed; Mira's shift was removed,
  -- but she applied the import herself and is not notified about her own action)
  assert (select count(*) from public.notifications where type = 'schedule_changed') = 1, 'one notification per person';
  assert (select u.email from public.notifications n join public.users u on u.id = n.recipient_id
          where n.type = 'schedule_changed') = 'anna.becker@shiftcare.dev', 'the right person';
  assert (select (payload ->> 'count')::int from public.notifications where type = 'schedule_changed') = 2, 'with the number of changes';
  assert exists (select 1 from public.audit_logs where table_name = 'import_runs'), 'imports are audited';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- 2. Existing draft roster, manual entries, failure and retry
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  s     public.schedules := (select x from public.schedules x where x.id = '70000000-0000-4000-a000-000000000002');
  run   public.import_runs;
  prev  jsonb;
  rows  jsonb;
begin
  rows := jsonb_build_array(
    jsonb_build_object('row_no', 1, 'employee_ref', 'P-1001', 'date', s.period_start + 2, 'code', 'S'),
    jsonb_build_object('row_no', 2, 'employee_ref', 'P-1003', 'date', s.period_start + 2, 'code', 'F'));

  -- wrong period for an existing roster
  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
    s.period_start, s.period_start + 9, 'x.csv', repeat('f', 64), 'list', '{}', rows);
  begin
    perform public.preview_import(run.id);
    raise exception 'period mismatch must fail';
  exception when invalid_parameter_value then null;
  end;

  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
                             s.period_start, s.period_end, 'x.csv', repeat('f', 64), 'list', '{}', rows);
  prev := public.preview_import(run.id);
  assert (prev -> 'schedule' ->> 'id')::uuid = s.id, 'imports into the existing draft';
  assert (prev -> 'counts' ->> 'manual')::int > 0, 'entries made in Dienstwerk are flagged';
  assert (prev -> 'counts' ->> 'removed')::int > 0, 'the file is the complete roster – others are removed';

  -- simulate a conflicting shift elsewhere: Leyla works on ITS1 at the same time
  reset role;
  delete from public.schedule_entries
   where schedule_id = s.id and employee_id = '40000000-0000-4000-a000-000000000003'
     and entry_date between s.period_start + 1 and s.period_start + 3;
  insert into public.schedules (id, hospital_id, unit_id, period_start, period_end)
  values ('7f000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003', s.period_start, s.period_end);
  insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date)
  values ('10000000-0000-4000-a000-000000000001', '7f000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003',
          'shift', '60000000-0000-4000-a000-000000000001', s.period_start + 2);
  set local role authenticated;

  run := public.apply_import(run.id);
  assert run.status = 'staged' and run.error_message is not null, 'failure is reported, run stays retryable';
  assert (select count(*) from public.schedule_entries where import_run_id = run.id) = 0, 'nothing half-written';

  reset role;
  delete from public.schedule_entries where schedule_id = '7f000000-0000-4000-a000-000000000001';
  set local role authenticated;
  run := public.apply_import(run.id);
  assert run.status = 'applied' and run.error_message is null, 'retry succeeds';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- 3. Permissions and tenant isolation
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.integration_sources), 'nurse sees no integration config';
  assert public.list_import_runs('10000000-0000-4000-a000-000000000001') = '[]'::jsonb, 'nurse sees no import history';
  begin
    perform public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
      current_date, current_date, 'x.csv', repeat('a', 64), 'list', '{}', '[{"row_no":1,"employee_ref":"P-1001","date":"2030-01-01","code":"F"}]');
    raise exception 'nurse must not import';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'lisa', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.integration_sources) = 1, 'Lisa sees only the profile of St. Marien';
  -- cannot use another hospital's profile or map its people
  begin
    perform public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000004',
      date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      'x.csv', repeat('a', 64), 'list', '{}', '[{"row_no":1,"employee_ref":"M-0101","date":"2030-01-01","code":"F"}]');
    raise exception 'foreign profile must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.confirm_employee_mapping('c0000000-0000-4000-a000-000000000002', 'EXT-1', '40000000-0000-4000-a000-000000000001');
    raise exception 'mapping to another hospital must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.stage_import('c0000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001',
      current_date, current_date, 'x.csv', repeat('a', 64), 'list', '{}', '[{"row_no":1,"employee_ref":"P-1001","date":"2030-01-01","code":"F"}]');
    raise exception 'foreign ward must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Personnel numbers of another hospital never match (Tom = M-0101 at St. Marien)
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare run public.import_runs;
begin
  run := public.stage_import('c0000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
    (date_trunc('month', current_date) + interval '2 months')::date, (date_trunc('month', current_date) + interval '3 months - 1 day')::date,
    'x.csv', repeat('a', 64), 'list', '{}',
    jsonb_build_array(jsonb_build_object('row_no', 1, 'employee_ref', 'M-0101', 'date', (date_trunc('month', current_date) + interval '2 months')::date, 'code', 'F')));
  assert (select employee_id from public.import_rows where run_id = run.id) is null, 'no cross-tenant match';
  begin
    perform public.confirm_employee_mapping('c0000000-0000-4000-a000-000000000001', 'M-0101', '40000000-0000-4000-a000-000000000008');
    raise exception 'cross-tenant mapping must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- 4. Configuration and credentials (Krankenhaus-Administration)
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare src uuid;
begin
  insert into public.integration_sources (hospital_id, name, kind, vendor)
  values ('10000000-0000-4000-a000-000000000001', 'Schnittstelle (geplant)', 'api', 'Beispielanbieter')
  returning id into src;
  perform public.set_integration_secret(src, 'super-secret-token');
  assert public.integration_source_has_secret(src), 'secret stored';
  begin
    perform secret_id from public.integration_sources where id = src;
    raise exception 'secret column must not be readable';
  exception when insufficient_privilege then null;
  end;
  -- a hospital-wide code mapping is allowed for configurators
  perform public.map_shift_code('c0000000-0000-4000-a000-000000000001', null, 'TD', 'shift', '60000000-0000-4000-a000-000000000001');
  -- API profiles cannot be used for file imports (not implemented)
  begin
    perform public.stage_import(src, '30000000-0000-4000-a000-000000000001', current_date, current_date, 'x', repeat('a', 64), 'list', '{}', '[{"row_no":1,"date":"2030-01-01","code":"F"}]');
    raise exception 'admin has no schedule.import';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  assert exists (select 1 from vault.secrets where name like 'integration_%'), 'secret lives in Vault';
  assert not exists (select 1 from public.integration_sources s join vault.secrets v on v.secret = 'super-secret-token'
                     where s.settings::text like '%super-secret%'), 'never in ordinary columns';
end $$;
rollback;

\o
\echo '  ✓ Integration Hub assertions passed'
