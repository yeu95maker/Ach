-- =============================================================================
-- Pulshift · Automatische Synchronisierung (Pulshift-Import-Schnittstelle)
--
-- The hospital's planning system (or its IT, or a small export job) sends the
-- published roster of a ward to the Edge Function `roster-sync`. It forwards
-- the request to public.ingest_roster(), which
--   * authenticates the sender with a per-profile API key (only a SHA-256
--     hash is stored, the key is shown once),
--   * stages the roster through the same pipeline as a file import
--     (employee and code mapping, validation, preview),
--   * does nothing when nothing changed,
--   * otherwise notifies the ward lead, who confirms the changes in the app.
--     Confirming = the existing "apply" step; affected staff are then notified.
-- Decision 11.10.2026: changes are never published without the ward lead.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- API keys per import profile
-- -----------------------------------------------------------------------------
create table public.integration_api_keys (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null,
  source_id    uuid not null,
  label        text check (char_length(label) <= 80),
  key_prefix   text not null,                        -- first characters, to recognise a key in the list
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  foreign key (hospital_id, source_id) references public.integration_sources (hospital_id, id) on delete cascade
);

create index integration_api_keys_source_idx on public.integration_api_keys (source_id);

alter table public.integration_api_keys enable row level security;
revoke all on public.integration_api_keys from anon, authenticated;
-- key_hash is never readable through the API
grant select (id, hospital_id, source_id, label, key_prefix, created_by, created_at, last_used_at, revoked_at)
  on public.integration_api_keys to authenticated;

create policy integration_api_keys_select on public.integration_api_keys
  for select to authenticated
  using (hospital_id in (select private.hospitals_with_permission('integrations.manage')));

create trigger integration_api_keys_audit
  after insert or update or delete on public.integration_api_keys
  for each row execute function private.audit_row();

-- -----------------------------------------------------------------------------
-- Who confirms a sync: everyone holding schedule.import for the ward
-- -----------------------------------------------------------------------------
create or replace function private.unit_user_ids_with_permission(p_unit_id uuid, p text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct holder.user_id
  from public.units u
  join public.employee_roles er   on er.hospital_id = u.hospital_id
  join public.role_permissions rp on rp.role_id = er.role_id and rp.permission_key = p
  join public.employees holder    on holder.id = er.employee_id and holder.status = 'active'
  where u.id = p_unit_id
    and (er.valid_until is null or er.valid_until > now())
    and (   (er.unit_id is null and er.department_id is null)
         or er.unit_id = u.id
         or er.department_id = u.department_id)
$$;
revoke execute on function private.unit_user_ids_with_permission(uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Key management (Verwaltung → Integrationen)
-- -----------------------------------------------------------------------------
create or replace function public.create_integration_api_key(p_source_id uuid, p_label text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_source public.integration_sources;
  v_key    text;
  v_id     uuid;
begin
  select * into v_source from public.integration_sources where id = p_source_id;
  if v_source.id is null or v_source.hospital_id not in (select private.hospitals_with_permission('integrations.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_source.kind <> 'api' then
    raise exception 'API keys exist only for profiles of type "Schnittstelle"' using errcode = '22023';
  end if;
  if (select count(*) from public.integration_api_keys k where k.source_id = p_source_id and k.revoked_at is null) >= 5 then
    raise exception 'At most 5 active keys per profile' using errcode = '22023';
  end if;

  v_key := 'pls_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.integration_api_keys (hospital_id, source_id, label, key_prefix, key_hash, created_by)
  values (v_source.hospital_id, v_source.id, nullif(btrim(p_label), ''), left(v_key, 12),
          encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), (select auth.uid()))
  returning id into v_id;

  -- The only moment the plain key exists outside the sender.
  return jsonb_build_object('id', v_id, 'key', v_key, 'prefix', left(v_key, 12));
end;
$$;

create or replace function public.revoke_integration_api_key(p_key_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.integration_api_keys k
     set revoked_at = coalesce(k.revoked_at, now())
   where k.id = p_key_id
     and k.hospital_id in (select private.hospitals_with_permission('integrations.manage'));
  if not found then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ingestion (called by the Edge Function with the service role only)
--
-- p_payload (Pulshift Roster Exchange v1, see docs/SCHNITTSTELLE.md):
-- {
--   "unit": "3A",                                  ward code in Pulshift
--   "period": { "start": "2026-11-01", "end": "2026-11-30" },
--   "source_version": "…",                         optional, shown in the history
--   "shifts": [ { "employee": "P-1001", "date": "2026-11-02", "code": "F",
--                 "start": "06:00", "end": "14:15", "break_minutes": 30,
--                 "id": "ext-123", "name": "Anna Becker" } ]
-- }
-- The Edge Function validates the shape; this function trusts nothing anyway.
-- -----------------------------------------------------------------------------
create or replace function public.ingest_roster(p_key text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_key     public.integration_api_keys;
  v_source  public.integration_sources;
  v_unit    public.units;
  v_start   date;
  v_end     date;
  v_sha     text;
  v_run     public.import_runs;
  v_last    public.import_runs;
  v_changes integer := 0;
  v_errors  integer;
  v_diff_ok boolean := true;
begin
  select * into v_key from public.integration_api_keys
   where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') and revoked_at is null;
  if v_key.id is null then
    raise exception 'Invalid API key' using errcode = '28000';
  end if;
  select * into v_source from public.integration_sources where id = v_key.source_id;
  if not v_source.is_active or v_source.kind <> 'api' then
    raise exception 'The import profile is inactive' using errcode = '28000';
  end if;
  update public.integration_api_keys set last_used_at = now() where id = v_key.id;

  -- Flood protection: at most 120 deliveries per hour and profile.
  if (select count(*) from public.import_runs r where r.source_id = v_source.id and r.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Too many deliveries, please try again later' using errcode = 'P0429';
  end if;

  select u.* into v_unit from public.units u
   where u.hospital_id = v_source.hospital_id and lower(u.code) = lower(btrim(p_payload ->> 'unit'))
     and (v_source.unit_id is null or u.id = v_source.unit_id);
  if v_unit.id is null then
    raise exception 'Unknown ward code "%"', p_payload ->> 'unit' using errcode = '22023';
  end if;

  begin
    v_start := (p_payload #>> '{period,start}')::date;
    v_end   := (p_payload #>> '{period,end}')::date;
  exception when others then
    raise exception 'period.start and period.end must be dates (YYYY-MM-DD)' using errcode = '22023';
  end;
  if v_start is null or v_end is null or v_end < v_start or v_end - v_start > 62 then
    raise exception 'The period must be 1 to 63 days' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'shifts') <> 'array' then
    raise exception 'shifts must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'shifts') > 10000 then
    raise exception 'Too many shifts (max. 10000)' using errcode = '22023';
  end if;

  -- The same delivery twice: nothing to do.
  v_sha := encode(sha256(convert_to(jsonb_build_object('unit', v_unit.id, 'start', v_start, 'end', v_end,
                                                       'shifts', p_payload -> 'shifts')::text, 'UTF8')), 'hex');
  select * into v_last from public.import_runs r
   where r.source_id = v_source.id and r.unit_id = v_unit.id and r.period_start = v_start and r.period_end = v_end
     and r.status in ('staged', 'applied', 'published')
   order by r.created_at desc limit 1;
  if v_last.id is not null and v_last.file_sha256 = v_sha then
    return jsonb_build_object('status', 'unchanged', 'run_id', v_last.id);
  end if;

  insert into public.import_runs (hospital_id, source_id, unit_id, period_start, period_end, file_name, file_sha256,
                                  layout, column_mapping)
  values (v_unit.hospital_id, v_source.id, v_unit.id, v_start, v_end,
          left('Schnittstelle · ' || v_source.name, 255), v_sha, 'list',
          jsonb_build_object('via', 'api', 'source_version', left(p_payload ->> 'source_version', 120), 'key_prefix', v_key.key_prefix))
  returning * into v_run;

  insert into public.import_rows (hospital_id, run_id, row_no, external_employee_id, employee_label, entry_date,
                                  start_time, end_time, external_code, break_minutes, external_shift_id)
  select v_run.hospital_id, v_run.id, x.ord::integer,
         left(nullif(btrim(x.s ->> 'employee'), ''), 64),
         left(nullif(btrim(x.s ->> 'name'), ''), 200),
         case when (x.s ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' then (x.s ->> 'date')::date end,
         case when (x.s ->> 'start') ~ '^\d{1,2}:\d{2}$' then (x.s ->> 'start')::time end,
         case when (x.s ->> 'end') ~ '^\d{1,2}:\d{2}$' then (x.s ->> 'end')::time end,
         left(nullif(btrim(x.s ->> 'code'), ''), 32),
         case when (x.s ->> 'break_minutes') ~ '^\d{1,3}$' and (x.s ->> 'break_minutes')::integer <= 600 then (x.s ->> 'break_minutes')::integer end,
         left(nullif(btrim(x.s ->> 'id'), ''), 128)
  from jsonb_array_elements(p_payload -> 'shifts') with ordinality as x(s, ord);

  perform private.resolve_import(v_run.id);
  select * into v_run from public.import_runs where id = v_run.id;
  v_errors := coalesce((v_run.summary ->> 'errors')::integer, 0);

  -- Count real changes against the current roster (the diff may fail, e.g. when
  -- the roster of this month has a different period – then the lead decides).
  begin
    select count(*) into v_changes from private.import_diff(v_run.id) d where d.change in ('added', 'changed', 'removed');
  exception when others then
    v_diff_ok := false;
  end;

  if v_errors = 0 and v_diff_ok and v_changes = 0 then
    update public.import_runs set status = 'cancelled', summary = summary || '{"no_changes": true}'::jsonb where id = v_run.id;
    return jsonb_build_object('status', 'no_changes', 'run_id', v_run.id);
  end if;

  -- Only the newest version of a ward/month waits for confirmation.
  update public.import_runs r set status = 'superseded'
   where r.source_id = v_source.id and r.unit_id = v_unit.id and r.period_start = v_start and r.period_end = v_end
     and r.status = 'staged' and r.id <> v_run.id;
  update public.import_runs set summary = summary || jsonb_build_object('changes', v_changes) where id = v_run.id;

  perform private.notify_users(
    v_unit.hospital_id,
    array(select private.unit_user_ids_with_permission(v_unit.id, 'schedule.import')),
    'roster_sync',
    jsonb_build_object('run_id', v_run.id, 'unit_name', v_unit.name, 'source_name', v_source.name,
                       'period_start', v_start, 'period_end', v_end, 'count', v_changes, 'errors', v_errors),
    'import_run', v_run.id);

  return jsonb_build_object('status', 'staged', 'run_id', v_run.id, 'changes', v_changes, 'errors', v_errors,
                            'warnings', coalesce((v_run.summary ->> 'warnings')::integer, 0));
end;
$$;

revoke execute on function public.ingest_roster(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_roster(text, jsonb) to service_role;

revoke execute on function public.create_integration_api_key(uuid, text), public.revoke_integration_api_key(uuid) from public, anon;
grant execute on function public.create_integration_api_key(uuid, text), public.revoke_integration_api_key(uuid) to authenticated;
