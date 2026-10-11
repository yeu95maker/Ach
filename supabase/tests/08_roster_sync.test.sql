-- =============================================================================
-- Automatische Synchronisierung: API keys, ingestion, lead confirmation
-- =============================================================================
\o /dev/null
\set admin '00000000-0000-4000-a000-000000000007'
\set hanna '00000000-0000-4000-a000-000000000006'
\set mira  '00000000-0000-4000-a000-000000000004'

create temp table _sync (k text primary key, v text);
grant all on _sync to authenticated, service_role;

-- Krankenhaus-Administration: profile of type "Schnittstelle" + key
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  src uuid;
  k jsonb;
begin
  insert into public.integration_sources (hospital_id, name, kind, vendor)
  values ('10000000-0000-4000-a000-000000000001', 'Schnittstelle Dienstplanprogramm', 'api', 'Testsystem')
  returning id into src;
  k := public.create_integration_api_key(src, 'Testsystem');
  assert (k ->> 'key') like 'pls_%' and length(k ->> 'key') = 52, 'plain key returned once';
  insert into _sync values ('src', src::text), ('key', k ->> 'key'), ('key_id', k ->> 'id');
  assert (select key_prefix from public.integration_api_keys where id = (k ->> 'id')::uuid) = left(k ->> 'key', 12), 'prefix visible';

  begin
    perform public.create_integration_api_key('c0000000-0000-4000-a000-000000000001', null);
    raise exception 'file profiles have no keys';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
commit;

do $$
begin
  assert not has_column_privilege('authenticated', 'public.integration_api_keys', 'key_hash', 'select'), 'hash is not readable';
  assert not has_function_privilege('authenticated', 'public.ingest_roster(text, jsonb)', 'execute'), 'users cannot ingest';
  assert not has_function_privilege('anon', 'public.ingest_roster(text, jsonb)', 'execute'), 'anon cannot ingest';
  assert (select key_hash from public.integration_api_keys where id = (select v::uuid from _sync where k = 'key_id'))
         = encode(sha256(convert_to((select v from _sync where k = 'key'), 'UTF8')), 'hex'), 'only the hash is stored';
end;
$$;

-- HR may not manage keys
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'hanna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.create_integration_api_key((select v::uuid from _sync where k = 'src'), null);
    raise exception 'HR must not create keys';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.integration_api_keys) = 0, 'HR sees no keys';
end;
$$;
commit;

-- The planning system delivers (Edge Function = service role)
begin;
set local role service_role;
do $$
declare
  key text := (select v from _sync where k = 'key');
  m date := (date_trunc('month', now()) + interval '3 months')::date;
  payload jsonb;
  r jsonb;
begin
  payload := jsonb_build_object(
    'unit', '3a',
    'period', jsonb_build_object('start', m, 'end', (m + interval '1 month - 1 day')::date),
    'source_version', 'Plan v7',
    'shifts', jsonb_build_array(
      jsonb_build_object('employee', 'P-1001', 'date', m + 1, 'code', 'F'),
      jsonb_build_object('employee', 'P-1001', 'date', m + 2, 'code', 'S'),
      jsonb_build_object('employee', 'P-1003', 'date', m + 1, 'code', 'N', 'id', 'ext-77')));

  begin
    perform public.ingest_roster('pls_wrong', payload);
    raise exception 'wrong key must fail';
  exception when sqlstate '28000' then null;
  end;
  begin
    perform public.ingest_roster(key, payload || '{"unit": "S2"}');
    raise exception 'ward of another hospital must be unknown';
  exception when invalid_parameter_value then null;
  end;

  r := public.ingest_roster(key, payload);
  assert r ->> 'status' = 'staged', format('staged, got %s', r);
  assert (r ->> 'changes')::int = 3 and (r ->> 'errors')::int = 0, format('3 new shifts, no errors: %s', r);
  insert into _sync values ('run', r ->> 'run_id'), ('payload', payload::text), ('month', m::text);

  -- same delivery again: nothing happens
  assert public.ingest_roster(key, payload) ->> 'status' = 'unchanged', 'idempotent';
end;
$$;
commit;

do $$
declare
  run uuid := (select v::uuid from _sync where k = 'run');
begin
  assert (select status from public.import_runs where id = run) = 'staged', 'waits for the lead';
  assert (select created_by from public.import_runs where id = run) is null, 'system delivery';
  assert exists (select 1 from public.notifications where type = 'roster_sync' and entity_id = run
                  and recipient_id = '00000000-0000-4000-a000-000000000004'), 'Mira is asked to confirm';
  assert not exists (select 1 from public.notifications where type = 'roster_sync' and entity_id = run
                      and recipient_id = '00000000-0000-4000-a000-000000000001'), 'nurses are not bothered';
  assert not exists (select 1 from public.schedule_entries where import_run_id = run), 'nothing in the roster before confirmation';
end;
$$;

-- Mira confirms: the existing apply step writes the roster
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  run uuid := (select v::uuid from _sync where k = 'run');
  applied public.import_runs;
begin
  applied := public.apply_import(run);
  assert applied.status = 'applied', format('applied, got %s', applied.status);
  assert (select count(*) from public.schedule_entries where import_run_id = run) = 3, 'three shifts written';
end;
$$;
commit;

-- A changed version arrives; the older staged version is superseded; a revoked key stops everything
begin;
set local role service_role;
do $$
declare
  key text := (select v from _sync where k = 'key');
  payload jsonb := (select v::jsonb from _sync where k = 'payload');
  m date := (select v::date from _sync where k = 'month');
  r1 jsonb;
  r2 jsonb;
begin
  assert public.ingest_roster(key, payload) ->> 'status' = 'unchanged', 'same as applied';
  r1 := public.ingest_roster(key, jsonb_set(payload, '{shifts,1,code}', '"N"'));
  assert r1 ->> 'status' = 'staged' and (r1 ->> 'changes')::int = 1, format('one change: %s', r1);
  r2 := public.ingest_roster(key, jsonb_set(payload, '{shifts,1,code}', '"F"'));
  assert r2 ->> 'status' = 'staged', 'newer version';
  assert (select status from public.import_runs where id = (r1 ->> 'run_id')::uuid) = 'superseded', 'older version superseded';
end;
$$;
commit;

update public.integration_api_keys set revoked_at = now() where id = (select v::uuid from _sync where k = 'key_id');
begin;
set local role service_role;
do $$
begin
  perform public.ingest_roster((select v from _sync where k = 'key'), (select v::jsonb from _sync where k = 'payload'));
  raise exception 'revoked key must fail';
exception when sqlstate '28000' then null;
end;
$$;
commit;

\o
\echo '  ✓ Synchronisierung assertions passed'
