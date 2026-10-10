-- =============================================================================
-- ShiftCare · Integration Hub
--
--   integration_sources ──< shift_code_mappings
--          │          └──< employee_external_ids >── employees
--          └──< import_runs ──< import_rows
--                    └── schedules ──< schedule_entries (source_id, import_key)
--
-- The external roster program stays the master. A ward lead uploads the
-- finished roster (CSV/XLSX); the browser adapter parses the file into
-- normalised rows; the database resolves employees and shift codes,
-- validates, shows a diff, applies it idempotently and – after explicit
-- confirmation – the existing publish_schedule() publishes it.
--
-- Wishes are never touched: imports only write schedule_entries.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Import profiles ("Quellsysteme") per hospital, optionally per ward
-- -----------------------------------------------------------------------------
create table public.integration_sources (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  unit_id     uuid,                                   -- NULL = all wards
  name        text not null check (char_length(name) between 1 and 120),
  kind        public.integration_kind not null default 'file',
  vendor      text check (char_length(vendor) <= 120), -- free text: which program the export comes from
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  secret_id   uuid,                                   -- Supabase Vault secret (API credentials); never exposed
  is_active   boolean not null default true,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (hospital_id, id),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade
);

comment on table public.integration_sources is
  'Import profile of a hospital: kind (file/api/sftp), source program, default settings. Credentials live in Vault (secret_id).';
comment on column public.integration_sources.settings is
  'Defaults for the import assistant: {"layout","date_format","delimiter","employee_key"}. No secrets.';

create trigger integration_sources_set_updated_at
  before update on public.integration_sources
  for each row execute function private.set_updated_at();

create or replace function private.integration_source_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  return new;
end;
$$;

create trigger integration_sources_before_insert
  before insert on public.integration_sources
  for each row execute function private.integration_source_before_insert();

-- -----------------------------------------------------------------------------
-- Confirmed mappings, reused by every later import of the same source
-- -----------------------------------------------------------------------------
create table public.shift_code_mappings (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null,
  source_id     uuid not null,
  unit_id       uuid,                                 -- NULL = all wards
  external_code text not null check (char_length(external_code) between 1 and 32),
  target        text not null check (target in ('shift', 'off', 'ignore')),
  shift_type_id uuid,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((target = 'shift') = (shift_type_id is not null)),
  foreign key (hospital_id, source_id)     references public.integration_sources (hospital_id, id) on delete cascade,
  foreign key (hospital_id, unit_id)       references public.units (hospital_id, id) on delete cascade,
  foreign key (hospital_id, shift_type_id) references public.shift_types (hospital_id, id) on delete cascade
);

create unique index shift_code_mappings_key_idx
  on public.shift_code_mappings (source_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(external_code));

create table public.employee_external_ids (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null,
  source_id    uuid not null,
  external_id  text not null check (char_length(external_id) between 1 and 64),
  employee_id  uuid not null,
  confirmed_by uuid references public.users (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  unique (source_id, external_id),
  unique (source_id, employee_id),
  foreign key (hospital_id, source_id)   references public.integration_sources (hospital_id, id) on delete cascade,
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id)           on delete cascade
);

comment on table public.employee_external_ids is
  'Confirmed link "ID in the source program" → employee. The composite FKs make a link to another hospital impossible.';

-- -----------------------------------------------------------------------------
-- Import runs and their rows
-- -----------------------------------------------------------------------------
create table public.import_runs (
  id             uuid primary key default gen_random_uuid(),
  hospital_id    uuid not null,
  source_id      uuid not null,
  unit_id        uuid not null,
  period_start   date not null,
  period_end     date not null,
  status         public.import_run_status not null default 'staged',
  file_name      text check (char_length(file_name) <= 255),
  file_sha256    text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  layout         text not null default 'list' check (layout in ('list', 'grid')),
  column_mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(column_mapping) = 'object'),
  summary        jsonb not null default '{}'::jsonb,
  error_message  text,
  duplicate_of   uuid references public.import_runs (id) on delete set null,
  schedule_id    uuid,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  applied_by     uuid references public.users (id) on delete set null,
  applied_at     timestamptz,
  published_at   timestamptz,
  raw_purged_at  timestamptz,
  unique (hospital_id, id),
  check (period_end >= period_start and period_end - period_start <= 62),
  foreign key (hospital_id, source_id)   references public.integration_sources (hospital_id, id) on delete cascade,
  foreign key (hospital_id, unit_id)     references public.units (hospital_id, id)               on delete cascade,
  foreign key (hospital_id, schedule_id) references public.schedules (hospital_id, id)           on delete set null (schedule_id)
);

create index import_runs_unit_idx on public.import_runs (unit_id, created_at desc);

create table public.import_rows (
  id                   uuid primary key default gen_random_uuid(),
  hospital_id          uuid not null,
  run_id               uuid not null,
  row_no               integer not null,
  external_employee_id text check (char_length(external_employee_id) <= 64),
  employee_label       text check (char_length(employee_label) <= 200),  -- name as in the file; purged after publishing
  entry_date           date,
  start_time           time,
  end_time             time,
  external_code        text check (char_length(external_code) <= 32),
  break_minutes        integer check (break_minutes between 0 and 600),
  external_shift_id    text check (char_length(external_shift_id) <= 128),
  raw                  jsonb,                                              -- original cells; purged after publishing
  employee_id          uuid,
  employee_match       text check (employee_match in ('mapping', 'personnel_number')),
  target               text check (target in ('shift', 'off', 'ignore')),
  shift_type_id        uuid,
  starts_at            timestamptz,
  ends_at              timestamptz,
  import_key           text,
  status               public.import_row_status not null default 'ok',
  messages             jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  unique (run_id, row_no),
  foreign key (hospital_id, run_id)        references public.import_runs (hospital_id, id) on delete cascade,
  foreign key (hospital_id, employee_id)   references public.employees (hospital_id, id)   on delete set null (employee_id),
  foreign key (hospital_id, shift_type_id) references public.shift_types (hospital_id, id) on delete set null (shift_type_id)
);

create index import_rows_run_idx on public.import_rows (run_id, status);

-- -----------------------------------------------------------------------------
-- Unified roster model: provenance of a schedule entry
-- -----------------------------------------------------------------------------
alter table public.schedule_entries
  add column source_id     uuid,
  add column import_run_id uuid,
  add column import_key    text,
  add column external_id   text check (char_length(external_id) <= 128),
  add column imported_at   timestamptz,
  add column break_minutes integer check (break_minutes between 0 and 600),
  add constraint schedule_entries_source_fk foreign key (hospital_id, source_id)
    references public.integration_sources (hospital_id, id) on delete set null (source_id),
  add constraint schedule_entries_import_run_fk foreign key (hospital_id, import_run_id)
    references public.import_runs (hospital_id, id) on delete set null (import_run_id);

comment on column public.schedule_entries.import_key is
  'Stable identity of an imported shift (external shift ID, else employee + day + ordinal). Re-imports update instead of duplicating.';
comment on column public.schedule_entries.break_minutes is
  'Break from the source system; NULL = break of the shift type.';

create unique index schedule_entries_import_key_idx
  on public.schedule_entries (schedule_id, import_key) where import_key is not null;

-- Shift list for the apps: add provenance + last update (appended columns keep the view compatible).
create or replace view public.shift_roster
with (security_invoker = true)
as
select
  se.id            as entry_id,
  se.hospital_id,
  se.schedule_id,
  s.status         as schedule_status,
  s.unit_id,
  un.name          as unit_name,
  se.employee_id,
  se.kind,
  se.entry_date,
  se.starts_at,
  se.ends_at,
  se.note,
  st.id            as shift_type_id,
  st.code          as shift_code,
  st.name          as shift_name,
  st.category      as shift_category,
  st.color         as shift_color,
  d.first_name,
  d.last_name,
  d.avatar_path,
  d.job_title,
  d.qualifications,
  se.updated_at,
  se.imported_at,
  coalesce(se.break_minutes, st.break_minutes) as break_minutes
from public.schedule_entries se
join public.schedules s       on s.id = se.schedule_id
join public.units un          on un.id = s.unit_id
left join public.shift_types st on st.id = se.shift_type_id
left join public.employee_directory d on d.employee_id = se.employee_id;

-- -----------------------------------------------------------------------------
-- RLS: everything belongs to exactly one hospital. Integration config is
-- visible to configurators and to people who may import; credentials never.
-- Writes to mappings, runs and rows happen only through the RPCs below.
-- -----------------------------------------------------------------------------
alter table public.integration_sources   enable row level security;
alter table public.shift_code_mappings   enable row level security;
alter table public.employee_external_ids enable row level security;
alter table public.import_runs           enable row level security;
alter table public.import_rows           enable row level security;

create or replace function private.integration_hospitals()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select private.hospitals_with_permission('integrations.manage')
  union
  select private.hospitals_with_any_permission('schedule.import')
$$;

-- column-level grants only: secret_id is never readable through the API
revoke all on public.integration_sources from anon, authenticated;
grant select (id, hospital_id, unit_id, name, kind, vendor, settings, is_active, created_by, created_at, updated_at)
  on public.integration_sources to authenticated;
grant insert (hospital_id, unit_id, name, kind, vendor, settings, is_active) on public.integration_sources to authenticated;
grant update (unit_id, name, kind, vendor, settings, is_active) on public.integration_sources to authenticated;
grant delete on public.integration_sources to authenticated;
revoke all on public.shift_code_mappings, public.employee_external_ids, public.import_runs, public.import_rows from anon, authenticated;
grant select on public.shift_code_mappings, public.employee_external_ids, public.import_runs, public.import_rows to authenticated;

create policy integration_sources_select on public.integration_sources
  for select to authenticated
  using (hospital_id in (select private.integration_hospitals()));

create policy integration_sources_write on public.integration_sources
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('integrations.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('integrations.manage')));

create policy shift_code_mappings_select on public.shift_code_mappings
  for select to authenticated
  using (hospital_id in (select private.integration_hospitals()));

create policy employee_external_ids_select on public.employee_external_ids
  for select to authenticated
  using (hospital_id in (select private.integration_hospitals()));

create policy import_runs_select on public.import_runs
  for select to authenticated
  using (
    unit_id in (select private.units_with_permission('schedule.import'))
    or hospital_id in (select private.hospitals_with_permission('integrations.manage'))
  );

create policy import_rows_select on public.import_rows
  for select to authenticated
  using (run_id in (select r.id from public.import_runs r));   -- inherits import_runs RLS

do $$
declare t text;
begin
  foreach t in array array['integration_sources', 'shift_code_mappings', 'employee_external_ids', 'import_runs'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.require_import_access(p_unit_id uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_unit_id is null or p_unit_id not in (select private.units_with_permission('schedule.import')) then
    raise exception 'Not allowed to import rosters for this ward' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.import_message(p_code text, p_params jsonb default '{}'::jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object('code', p_code, 'params', p_params)
$$;

-- Re-evaluates every row of a staged run: employee, shift code, times,
-- period, overlaps inside the file and the identity key.
create or replace function private.resolve_import(p_run_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_run public.import_runs;
  v_tz  text;
begin
  select * into v_run from public.import_runs where id = p_run_id for update;
  select h.timezone into v_tz from public.hospitals h where h.id = v_run.hospital_id;

  update public.import_rows r
     set employee_id = null, employee_match = null, target = null, shift_type_id = null,
         starts_at = null, ends_at = null, import_key = null, status = 'ok', messages = '[]'::jsonb
   where r.run_id = p_run_id;

  -- 1. Employees: confirmed external ID first, then exact personnel number. Never by name.
  update public.import_rows r
     set employee_id = m.employee_id, employee_match = 'mapping'
    from public.employee_external_ids m
    join public.employees e on e.id = m.employee_id and e.status = 'active'
   where r.run_id = p_run_id and m.source_id = v_run.source_id
     and r.external_employee_id is not null and m.external_id = r.external_employee_id;

  update public.import_rows r
     set employee_id = e.id, employee_match = 'personnel_number'
    from public.employees e
   where r.run_id = p_run_id and r.employee_id is null
     and r.external_employee_id is not null
     and e.hospital_id = v_run.hospital_id and e.status = 'active'
     and e.personnel_number = r.external_employee_id
     -- an ID already confirmed for another person must not silently match by personnel number
     and not exists (select 1 from public.employee_external_ids m
                     where m.source_id = v_run.source_id and m.external_id = r.external_employee_id);

  -- 2. Shift codes: confirmed mapping (ward before hospital-wide), then shift type code.
  update public.import_rows r
     set (target, shift_type_id) = (
       select scm.target, scm.shift_type_id
       from public.shift_code_mappings scm
       where scm.source_id = v_run.source_id and lower(scm.external_code) = lower(r.external_code)
         and (scm.unit_id = v_run.unit_id or scm.unit_id is null)
       order by scm.unit_id nulls last
       limit 1)
   where r.run_id = p_run_id and r.external_code is not null
     and exists (select 1 from public.shift_code_mappings scm
                 where scm.source_id = v_run.source_id and lower(scm.external_code) = lower(r.external_code)
                   and (scm.unit_id = v_run.unit_id or scm.unit_id is null));

  update public.import_rows r
     set target = 'shift',
         shift_type_id = (
           select t.id from public.shift_types t
           where t.hospital_id = v_run.hospital_id and t.is_active and lower(t.code) = lower(r.external_code)
             and (t.unit_id = v_run.unit_id or t.unit_id is null)
           order by t.unit_id nulls last
           limit 1)
   where r.run_id = p_run_id and r.target is null and r.external_code is not null
     and exists (select 1 from public.shift_types t
                 where t.hospital_id = v_run.hospital_id and t.is_active and lower(t.code) = lower(r.external_code)
                   and (t.unit_id = v_run.unit_id or t.unit_id is null));

  -- Empty cells / codes mapped to "ignore" are skipped silently.
  update public.import_rows r
     set status = 'ignored', messages = jsonb_build_array(private.import_message(case when r.external_code is null then 'empty' else 'code_ignored' end))
   where r.run_id = p_run_id and (r.external_code is null or r.target = 'ignore');

  -- 3. Times (hospital time zone; end <= start → next day, e.g. night shifts)
  update public.import_rows r
     set starts_at = case
           when r.start_time is not null then (r.entry_date + r.start_time) at time zone v_tz
           else (r.entry_date + st.start_time) at time zone v_tz end,
         ends_at = case
           when r.start_time is not null and r.end_time is not null then
             (r.entry_date + r.end_time + case when r.end_time <= r.start_time then interval '1 day' else interval '0' end) at time zone v_tz
           else
             (r.entry_date + st.end_time + case when st.end_time <= st.start_time then interval '1 day' else interval '0' end) at time zone v_tz end
    from public.shift_types st
   where r.run_id = p_run_id and r.status <> 'ignored' and r.target = 'shift' and st.id = r.shift_type_id
     and r.entry_date is not null;

  -- 4. Errors and warnings
  update public.import_rows r
     set messages = r.messages || private.import_message('missing_date'), status = 'error'
   where r.run_id = p_run_id and r.status <> 'ignored' and r.entry_date is null;

  update public.import_rows r
     set messages = r.messages || private.import_message('outside_period',
                      jsonb_build_object('from', v_run.period_start, 'to', v_run.period_end)), status = 'error'
   where r.run_id = p_run_id and r.status <> 'ignored' and r.entry_date not between v_run.period_start and v_run.period_end;

  update public.import_rows r
     set messages = r.messages || private.import_message('employee_unmatched',
                      jsonb_build_object('ref', coalesce(r.external_employee_id, ''))), status = 'error'
   where r.run_id = p_run_id and r.status <> 'ignored' and r.employee_id is null;

  update public.import_rows r
     set messages = r.messages || private.import_message('unknown_code', jsonb_build_object('code', r.external_code)), status = 'error'
   where r.run_id = p_run_id and r.status <> 'ignored' and r.target is null;

  update public.import_rows r
     set messages = r.messages || private.import_message('invalid_times'), status = 'error'
   where r.run_id = p_run_id and r.status <> 'ignored' and r.target = 'shift'
     and (r.starts_at is null or r.ends_at is null or r.ends_at <= r.starts_at or r.ends_at - r.starts_at > interval '24 hours');

  update public.import_rows r
     set messages = r.messages || private.import_message('not_in_unit'),
         status = case when r.status = 'ok' then 'warning' else r.status end
   where r.run_id = p_run_id and r.status in ('ok', 'warning') and r.employee_id is not null
     and not exists (select 1 from public.employee_units eu where eu.employee_id = r.employee_id and eu.unit_id = v_run.unit_id);

  -- exact duplicates inside the file: keep the first, ignore the rest
  with d as (
    select r.id, row_number() over (partition by r.employee_id, r.entry_date, r.target, r.shift_type_id, r.starts_at order by r.row_no) as n
    from public.import_rows r
    where r.run_id = p_run_id and r.status in ('ok', 'warning')
  )
  update public.import_rows r
     set status = 'ignored', messages = r.messages || private.import_message('duplicate_row')
    from d where d.id = r.id and d.n > 1;

  -- overlapping shifts of the same person inside the file
  update public.import_rows r
     set messages = r.messages || private.import_message('overlap_in_file', jsonb_build_object('row', o.row_no)), status = 'error'
    from public.import_rows o
   where r.run_id = p_run_id and o.run_id = p_run_id and o.id <> r.id
     and r.status in ('ok', 'warning', 'error') and o.status in ('ok', 'warning', 'error')
     and r.target = 'shift' and o.target = 'shift' and r.employee_id = o.employee_id
     and tstzrange(r.starts_at, r.ends_at) && tstzrange(o.starts_at, o.ends_at);

  -- "Frei" and a shift on the same day: the shift wins, "Frei" is dropped
  update public.import_rows r
     set status = 'ignored', messages = r.messages || private.import_message('off_and_shift')
   where r.run_id = p_run_id and r.target = 'off' and r.status in ('ok', 'warning')
     and exists (select 1 from public.import_rows o
                 where o.run_id = p_run_id and o.target = 'shift' and o.status in ('ok', 'warning')
                   and o.employee_id = r.employee_id and o.entry_date = r.entry_date);

  -- 5. Identity key: external shift ID, else employee + day + ordinal
  with k as (
    select r.id,
           coalesce('x:' || r.external_shift_id,
                    'e:' || r.employee_id || ':' || r.entry_date || ':'
                      || row_number() over (partition by r.employee_id, r.entry_date order by r.starts_at nulls first, r.row_no)) as key
    from public.import_rows r
    where r.run_id = p_run_id and r.status in ('ok', 'warning')
  )
  update public.import_rows r set import_key = k.key from k where k.id = r.id;

  update public.import_runs u
     set summary = (
       select jsonb_build_object(
         'total',    count(*),
         'ok',       count(*) filter (where r.status = 'ok'),
         'warnings', count(*) filter (where r.status = 'warning'),
         'errors',   count(*) filter (where r.status = 'error'),
         'ignored',  count(*) filter (where r.status = 'ignored'),
         'unmatched_employees', count(distinct coalesce(r.external_employee_id, r.employee_label))
                                  filter (where r.status <> 'ignored' and r.employee_id is null),
         'unknown_codes', count(distinct lower(r.external_code)) filter (where r.status <> 'ignored' and r.target is null))
       from public.import_rows r where r.run_id = p_run_id)
   where u.id = p_run_id;
end;
$$;

-- The roster an import writes into: exactly the same ward and period.
create or replace function private.import_schedule(v_run public.import_runs)
returns public.schedules
language plpgsql stable security definer
set search_path = ''
as $$
declare
  s public.schedules;
begin
  select * into s from public.schedules
  where unit_id = v_run.unit_id and status <> 'archived'
    and daterange(period_start, period_end, '[]') && daterange(v_run.period_start, v_run.period_end, '[]')
  order by period_start
  limit 1;
  if s.id is not null and (s.period_start <> v_run.period_start or s.period_end <> v_run.period_end) then
    raise exception 'An existing roster of this ward covers % – %; import exactly that period', s.period_start, s.period_end
      using errcode = '22023';
  end if;
  return s;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: stage a parsed file
--   p_rows: [{row_no, employee_ref, employee_label, date, start, end, code,
--             break_minutes, external_shift_id, raw}]
-- -----------------------------------------------------------------------------
create or replace function public.stage_import(
  p_source_id    uuid,
  p_unit_id      uuid,
  p_period_start date,
  p_period_end   date,
  p_file_name    text,
  p_file_sha256  text,
  p_layout       text,
  p_mapping      jsonb,
  p_rows         jsonb
)
returns public.import_runs
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_source public.integration_sources;
  v_unit   public.units;
  v_run    public.import_runs;
  v_dup    uuid;
begin
  perform private.require_import_access(p_unit_id);
  select * into v_unit from public.units where id = p_unit_id;
  select * into v_source from public.integration_sources where id = p_source_id;
  if v_source.id is null or v_source.hospital_id <> v_unit.hospital_id or not v_source.is_active
     or (v_source.unit_id is not null and v_source.unit_id <> p_unit_id) then
    raise exception 'Unknown or inactive import profile for this ward' using errcode = '22023';
  end if;
  if v_source.kind <> 'file' then
    raise exception 'Only file imports are available' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file contains no rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'Too many rows (max. 10000)' using errcode = '22023';
  end if;

  select r.id into v_dup from public.import_runs r
  where r.source_id = p_source_id and r.unit_id = p_unit_id and r.file_sha256 = p_file_sha256
    and r.period_start = p_period_start and r.period_end = p_period_end
    and r.status in ('applied', 'published')
  order by r.created_at desc limit 1;

  insert into public.import_runs (hospital_id, source_id, unit_id, period_start, period_end, file_name, file_sha256,
                                  layout, column_mapping, duplicate_of, created_by)
  values (v_unit.hospital_id, p_source_id, p_unit_id, p_period_start, p_period_end, left(p_file_name, 255),
          lower(p_file_sha256), coalesce(p_layout, 'list'), coalesce(p_mapping, '{}'::jsonb), v_dup, (select auth.uid()))
  returning * into v_run;

  insert into public.import_rows (hospital_id, run_id, row_no, external_employee_id, employee_label, entry_date,
                                  start_time, end_time, external_code, break_minutes, external_shift_id, raw)
  select v_run.hospital_id, v_run.id,
         (x ->> 'row_no')::integer,
         nullif(btrim(x ->> 'employee_ref'), ''),
         nullif(btrim(x ->> 'employee_label'), ''),
         (x ->> 'date')::date,
         nullif(x ->> 'start', '')::time,
         nullif(x ->> 'end', '')::time,
         nullif(btrim(x ->> 'code'), ''),
         nullif(x ->> 'break_minutes', '')::integer,
         nullif(btrim(x ->> 'external_shift_id'), ''),
         case when jsonb_typeof(x -> 'raw') = 'object' then x -> 'raw' end
  from jsonb_array_elements(p_rows) x;

  perform private.resolve_import(v_run.id);
  select * into v_run from public.import_runs where id = v_run.id;
  return v_run;
end;
$$;

create or replace function public.revalidate_import(p_run_id uuid)
returns public.import_runs
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_run public.import_runs;
begin
  select * into v_run from public.import_runs where id = p_run_id;
  perform private.require_import_access(v_run.unit_id);
  if v_run.status <> 'staged' then
    raise exception 'This import can no longer be changed' using errcode = '22023';
  end if;
  perform private.resolve_import(p_run_id);
  select * into v_run from public.import_runs where id = p_run_id;
  return v_run;
end;
$$;

create or replace function public.cancel_import(p_run_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_run public.import_runs;
begin
  select * into v_run from public.import_runs where id = p_run_id;
  perform private.require_import_access(v_run.unit_id);
  update public.import_runs set status = 'cancelled' where id = p_run_id and status = 'staged';
  update public.import_rows set raw = null, employee_label = null where run_id = p_run_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: confirm mappings (reused by later imports)
-- -----------------------------------------------------------------------------
create or replace function public.confirm_employee_mapping(p_source_id uuid, p_external_id text, p_employee_id uuid)
returns public.employee_external_ids
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_source public.integration_sources;
  v_emp    public.employees;
  v_result public.employee_external_ids;
begin
  select * into v_source from public.integration_sources where id = p_source_id;
  select * into v_emp from public.employees where id = p_employee_id;
  if v_source.id is null or v_emp.id is null or v_emp.hospital_id <> v_source.hospital_id then
    raise exception 'Employee and import profile must belong to the same hospital' using errcode = '42501';
  end if;
  if not (v_source.hospital_id in (select private.hospitals_with_permission('integrations.manage'))
          or exists (select 1 from public.employee_units eu
                     where eu.employee_id = p_employee_id
                       and eu.unit_id in (select private.units_with_permission('schedule.import')))) then
    raise exception 'Not allowed to map this employee' using errcode = '42501';
  end if;
  if nullif(btrim(p_external_id), '') is null then
    raise exception 'External ID required' using errcode = '22023';
  end if;
  if exists (select 1 from public.employee_external_ids
             where source_id = p_source_id and employee_id = p_employee_id and external_id <> btrim(p_external_id)) then
    raise exception 'This employee already has another ID in this source' using errcode = '23505';
  end if;

  insert into public.employee_external_ids (hospital_id, source_id, external_id, employee_id, confirmed_by)
  values (v_source.hospital_id, p_source_id, btrim(p_external_id), p_employee_id, (select auth.uid()))
  on conflict (source_id, external_id) do update
    set employee_id = excluded.employee_id, confirmed_by = excluded.confirmed_by, confirmed_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.remove_employee_mapping(p_mapping_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  delete from public.employee_external_ids m
  where m.id = p_mapping_id
    and (m.hospital_id in (select private.hospitals_with_permission('integrations.manage'))
         or exists (select 1 from public.employee_units eu
                    where eu.employee_id = m.employee_id
                      and eu.unit_id in (select private.units_with_permission('schedule.import'))));
end;
$$;

create or replace function public.map_shift_code(
  p_source_id     uuid,
  p_unit_id       uuid,
  p_code          text,
  p_target        text,
  p_shift_type_id uuid default null
)
returns public.shift_code_mappings
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_source public.integration_sources;
  v_result public.shift_code_mappings;
begin
  select * into v_source from public.integration_sources where id = p_source_id;
  if v_source.id is null then
    raise exception 'Unknown import profile' using errcode = '22023';
  end if;
  -- ward-specific mapping: may import for that ward; hospital-wide: configurator
  if p_unit_id is not null then
    perform private.require_import_access(p_unit_id);
  elsif v_source.hospital_id not in (select private.hospitals_with_permission('integrations.manage')) then
    raise exception 'Only integration managers can map codes for all wards' using errcode = '42501';
  end if;
  if p_target not in ('shift', 'off', 'ignore') or (p_target = 'shift') <> (p_shift_type_id is not null) then
    raise exception 'Invalid mapping target' using errcode = '22023';
  end if;
  if p_shift_type_id is not null and not exists (
    select 1 from public.shift_types t
    where t.id = p_shift_type_id and t.hospital_id = v_source.hospital_id
      and (t.unit_id is null or t.unit_id = p_unit_id)) then
    raise exception 'Shift type not available for this ward' using errcode = '22023';
  end if;

  delete from public.shift_code_mappings
  where source_id = p_source_id and unit_id is not distinct from p_unit_id and lower(external_code) = lower(btrim(p_code));
  insert into public.shift_code_mappings (hospital_id, source_id, unit_id, external_code, target, shift_type_id, created_by)
  values (v_source.hospital_id, p_source_id, p_unit_id, btrim(p_code), p_target, p_shift_type_id, (select auth.uid()))
  returning * into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: diff against the current roster (read only)
-- -----------------------------------------------------------------------------
create or replace function private.import_diff(p_run_id uuid)
returns table (change text, entry_id uuid, row_id uuid, employee_id uuid, old_employee_id uuid, entry_date date,
               old_kind text, old_shift_type_id uuid, old_starts_at timestamptz, old_ends_at timestamptz,
               new_kind text, new_shift_type_id uuid, new_starts_at timestamptz, new_ends_at timestamptz,
               manually_changed boolean)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run   public.import_runs;
  v_sched public.schedules;
begin
  select * into v_run from public.import_runs where id = p_run_id;
  v_sched := private.import_schedule(v_run);

  return query
  with incoming as (
    select r.id, r.import_key, r.employee_id, r.entry_date, r.target::text as kind, r.shift_type_id, r.starts_at, r.ends_at
    from public.import_rows r
    where r.run_id = p_run_id and r.status in ('ok', 'warning')
  ),
  cur as (
    select e.id, e.import_key, e.employee_id, e.entry_date, e.kind::text as kind, e.shift_type_id, e.starts_at, e.ends_at,
           (e.imported_at is null or e.updated_at > e.imported_at + interval '1 second') as manual
    from public.schedule_entries e
    where e.schedule_id = v_sched.id
  ),
  matched as (
    -- by key; entries created in ShiftCare (no key) match by person + day + kind
    select i.id as row_id, c.id as entry_id
    from incoming i
    join cur c on c.import_key = i.import_key
    union
    select i.id, c.id
    from incoming i
    join cur c on c.import_key is null and c.employee_id = i.employee_id and c.entry_date = i.entry_date and c.kind = i.kind
    where not exists (select 1 from cur c2 where c2.import_key = i.import_key)
  ),
  m as (
    select distinct on (row_id) row_id, entry_id from matched order by row_id, entry_id
  ),
  m2 as (
    select distinct on (entry_id) row_id, entry_id from m order by entry_id, row_id
  )
  select
    case when c.id is null then 'added'
         when c.employee_id is distinct from i.employee_id or c.kind <> i.kind or c.shift_type_id is distinct from i.shift_type_id
              or c.starts_at is distinct from i.starts_at or c.ends_at is distinct from i.ends_at then 'changed'
         else 'unchanged' end,
    c.id, i.id, i.employee_id, c.employee_id, i.entry_date,
    c.kind, c.shift_type_id, c.starts_at, c.ends_at,
    i.kind, i.shift_type_id, i.starts_at, i.ends_at,
    coalesce(c.manual, false)
  from incoming i
  left join m2 on m2.row_id = i.id
  left join cur c on c.id = m2.entry_id
  union all
  select 'removed', c.id, null, c.employee_id, c.employee_id, c.entry_date,
         c.kind, c.shift_type_id, c.starts_at, c.ends_at,
         null, null, null, null, c.manual
  from cur c
  where c.id not in (select entry_id from m2);
end;
$$;

create or replace function public.preview_import(p_run_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_run   public.import_runs;
  v_sched public.schedules;
begin
  select * into v_run from public.import_runs where id = p_run_id;
  perform private.require_import_access(v_run.unit_id);
  v_sched := private.import_schedule(v_run);

  return jsonb_build_object(
    'schedule', case when v_sched.id is null then null else jsonb_build_object('id', v_sched.id, 'status', v_sched.status, 'version', v_sched.version) end,
    'counts', (select jsonb_build_object(
                 'added',     count(*) filter (where d.change = 'added'),
                 'changed',   count(*) filter (where d.change = 'changed'),
                 'removed',   count(*) filter (where d.change = 'removed'),
                 'unchanged', count(*) filter (where d.change = 'unchanged'),
                 'manual',    count(*) filter (where d.change in ('changed', 'removed') and d.manually_changed))
               from private.import_diff(p_run_id) d),
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'change', d.change, 'employee_id', d.employee_id, 'date', d.entry_date,
               'old', case when d.old_kind is null then null else jsonb_build_object('kind', d.old_kind, 'code', ost.code, 'starts_at', d.old_starts_at, 'ends_at', d.old_ends_at) end,
               'new', case when d.new_kind is null then null else jsonb_build_object('kind', d.new_kind, 'code', nst.code, 'starts_at', d.new_starts_at, 'ends_at', d.new_ends_at) end,
               'manual', d.manually_changed)
             order by d.entry_date, d.employee_id)
      from private.import_diff(p_run_id) d
      left join public.shift_types ost on ost.id = d.old_shift_type_id
      left join public.shift_types nst on nst.id = d.new_shift_type_id
      where d.change <> 'unchanged'), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: apply – writes the diff in one transaction (all or nothing)
-- -----------------------------------------------------------------------------
create or replace function public.apply_import(p_run_id uuid)
returns public.import_runs
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_run    public.import_runs;
  v_sched  public.schedules;
  v_counts jsonb;
  v_now    timestamptz := now();
begin
  select * into v_run from public.import_runs where id = p_run_id for update;
  perform private.require_import_access(v_run.unit_id);
  if v_run.unit_id not in (select private.units_with_permission('schedule.manage')) then
    raise exception 'Not allowed to change the roster of this ward' using errcode = '42501';
  end if;
  if v_run.status <> 'staged' then
    raise exception 'This import was already %', v_run.status using errcode = '55000';
  end if;
  if (v_run.summary ->> 'errors')::integer > 0 then
    raise exception 'Resolve all errors before applying' using errcode = '22023';
  end if;
  -- stale: somebody applied a newer upload of the same ward/period in the meantime
  if exists (select 1 from public.import_runs o
             where o.unit_id = v_run.unit_id and o.period_start = v_run.period_start and o.period_end = v_run.period_end
               and o.id <> v_run.id and o.status in ('applied', 'published') and o.applied_at > v_run.created_at) then
    update public.import_runs set status = 'superseded' where id = p_run_id returning * into v_run;
    return v_run;
  end if;

  begin
    v_sched := private.import_schedule(v_run);
    if v_sched.id is null then
      insert into public.schedules (hospital_id, unit_id, period_start, period_end, created_by)
      values (v_run.hospital_id, v_run.unit_id, v_run.period_start, v_run.period_end, (select auth.uid()))
      returning * into v_sched;
    end if;
    perform 1 from public.schedules where id = v_sched.id for update;   -- serialise concurrent imports

    drop table if exists pg_temp._import_diff;
    create temporary table _import_diff on commit drop as select * from private.import_diff(p_run_id);
    select jsonb_build_object(
             'added',     count(*) filter (where change = 'added'),
             'changed',   count(*) filter (where change = 'changed'),
             'removed',   count(*) filter (where change = 'removed'),
             'unchanged', count(*) filter (where change = 'unchanged'))
      into v_counts from _import_diff;

    -- One summary notification per person instead of one per entry (see below).
    perform set_config('shiftcare.bulk_import', 'on', true);

    -- Remove everything that disappears or changes, then insert the new state.
    -- Changed entries keep their id. Doing all deletes first avoids transient
    -- overlaps (e.g. a whole rotation moving by one day).
    delete from public.schedule_entries e
    using _import_diff d where d.change in ('removed', 'changed') and e.id = d.entry_id;

    update public.schedule_entries e
       set source_id = v_run.source_id, import_run_id = v_run.id, import_key = r.import_key, imported_at = v_now,
           external_id = r.external_shift_id, break_minutes = r.break_minutes
      from _import_diff d
      join public.import_rows r on r.id = d.row_id
     where d.change = 'unchanged' and e.id = d.entry_id;

    insert into public.schedule_entries (id, hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date, starts_at, ends_at,
                                         break_minutes, external_id, source_id, import_run_id, import_key, imported_at)
    select coalesce(case when d.change = 'changed' then d.entry_id end, gen_random_uuid()),
           v_run.hospital_id, v_sched.id, r.employee_id, r.target::public.schedule_entry_kind,
           case when r.target = 'shift' then r.shift_type_id end, r.entry_date,
           case when r.target = 'shift' then r.starts_at end, case when r.target = 'shift' then r.ends_at end,
           r.break_minutes, r.external_shift_id, v_run.source_id, v_run.id, r.import_key, v_now
    from _import_diff d
    join public.import_rows r on r.id = d.row_id
    where d.change in ('added', 'changed');

    perform set_config('shiftcare.bulk_import', 'off', true);

    -- Published roster: tell every affected person once.
    if v_sched.status = 'published' then
      perform private.notify_users(
        v_run.hospital_id,
        array(select distinct e.user_id
              from _import_diff d
              join public.employees e on e.id in (d.employee_id, d.old_employee_id)
              where d.change <> 'unchanged'),
        'schedule_changed',
        jsonb_build_object('schedule_id', v_sched.id,
                           'unit_name', (select u.name from public.units u where u.id = v_run.unit_id),
                           'entry_date', (select min(d.entry_date) from _import_diff d where d.change <> 'unchanged'),
                           'count', (select count(*) from _import_diff d where d.change <> 'unchanged')),
        'schedule', v_sched.id);
    end if;

    update public.import_runs
       set status = 'applied', schedule_id = v_sched.id, applied_at = v_now, applied_by = (select auth.uid()),
           error_message = null, summary = summary || jsonb_build_object('diff', v_counts)
     where id = p_run_id
    returning * into v_run;

    -- older staged uploads of the same ward/period are outdated now
    update public.import_runs
       set status = 'superseded'
     where unit_id = v_run.unit_id and period_start = v_run.period_start and period_end = v_run.period_end
       and status = 'staged' and id <> v_run.id;
  exception
    when exclusion_violation or unique_violation or check_violation or foreign_key_violation then
      -- everything inside this block is rolled back; the run stays 'staged' and can be retried
      update public.import_runs set error_message = left(sqlerrm, 500) where id = p_run_id returning * into v_run;
  end;

  return v_run;
end;
$$;

-- Bulk imports send one summary notification per person (see apply_import).
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
      array(
        select e.user_id from public.employee_units eu
        join public.employees e on e.id = eu.employee_id and e.status = 'active'
        where eu.unit_id = s.unit_id),
      'open_shift',
      jsonb_build_object('entry_date', new.entry_date, 'starts_at', new.starts_at, 'ends_at', new.ends_at,
                         'unit_name', (select u.name from public.units u where u.id = s.unit_id)),
      'schedule_entry', new.id);
  end if;

  return null;
end;
$$;

-- Publishing the roster marks the applied imports as published and drops raw file content.
create or replace function private.on_schedule_published_imports()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published' or new.version <> old.version) then
    update public.import_runs
       set status = 'published', published_at = now(), raw_purged_at = now()
     where schedule_id = new.id and status = 'applied';
    update public.import_rows r
       set raw = null, employee_label = null
      from public.import_runs u
     where u.id = r.run_id and u.schedule_id = new.id and u.status = 'published'
       and (r.raw is not null or r.employee_label is not null);
  end if;
  return null;
end;
$$;

create trigger schedules_publish_imports
  after update of status, version on public.schedules
  for each row execute function private.on_schedule_published_imports();

-- -----------------------------------------------------------------------------
-- Credentials for future API adapters: write-only, stored in Vault
-- -----------------------------------------------------------------------------
create or replace function public.set_integration_secret(p_source_id uuid, p_secret text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_source public.integration_sources;
begin
  select * into v_source from public.integration_sources where id = p_source_id;
  if v_source.id is null or v_source.hospital_id not in (select private.hospitals_with_permission('integrations.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_source.secret_id is not null then
    delete from vault.secrets where id = v_source.secret_id;
  end if;
  update public.integration_sources
     set secret_id = case when nullif(p_secret, '') is null then null
                          else vault.create_secret(p_secret, 'integration_' || p_source_id || '_' || extract(epoch from now())::bigint) end
   where id = p_source_id;
end;
$$;

create or replace function public.integration_source_has_secret(p_source_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select s.secret_id is not null from public.integration_sources s
  where s.id = p_source_id and s.hospital_id in (select private.hospitals_with_permission('integrations.manage'))
$$;

-- Import history with ward, profile and the responsible person.
create or replace function public.list_import_runs(p_hospital_id uuid, p_limit integer default 50)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'status', r.status, 'unit_id', r.unit_id, 'unit_name', u.name, 'source_name', s.name,
      'period_start', r.period_start, 'period_end', r.period_end, 'file_name', r.file_name,
      'summary', r.summary, 'error_message', r.error_message, 'duplicate_of', r.duplicate_of, 'schedule_id', r.schedule_id,
      'created_at', r.created_at, 'applied_at', r.applied_at, 'published_at', r.published_at,
      'created_by_name', btrim(coalesce(cu.first_name, '') || ' ' || coalesce(cu.last_name, '')),
      'applied_by_name', nullif(btrim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), '')) as x
    from public.import_runs r
    join public.units u on u.id = r.unit_id
    join public.integration_sources s on s.id = r.source_id
    left join public.users cu on cu.id = r.created_by
    left join public.users au on au.id = r.applied_by
    where r.hospital_id = p_hospital_id
      and (r.unit_id in (select private.units_with_permission('schedule.import'))
           or r.hospital_id in (select private.hospitals_with_permission('integrations.manage')))
    order by r.created_at desc
    limit least(greatest(p_limit, 1), 200)
  ) q
$$;

-- Raw file content is kept for at most 30 days.
create or replace function private.purge_import_raw()
returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.import_rows r set raw = null, employee_label = null
  from public.import_runs u
  where u.id = r.run_id and u.created_at < now() - interval '30 days'
    and (r.raw is not null or r.employee_label is not null);
  update public.import_runs set raw_purged_at = now()
  where created_at < now() - interval '30 days' and raw_purged_at is null;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('shiftcare-import-purge', '17 3 * * *', 'select private.purge_import_raw()');
  end if;
end $$;

revoke execute on function
  public.stage_import(uuid, uuid, date, date, text, text, text, jsonb, jsonb), public.revalidate_import(uuid),
  public.cancel_import(uuid), public.confirm_employee_mapping(uuid, text, uuid), public.remove_employee_mapping(uuid),
  public.map_shift_code(uuid, uuid, text, text, uuid), public.preview_import(uuid), public.apply_import(uuid),
  public.set_integration_secret(uuid, text), public.integration_source_has_secret(uuid), public.list_import_runs(uuid, integer)
  from public, anon;
grant execute on function
  public.stage_import(uuid, uuid, date, date, text, text, text, jsonb, jsonb), public.revalidate_import(uuid),
  public.cancel_import(uuid), public.confirm_employee_mapping(uuid, text, uuid), public.remove_employee_mapping(uuid),
  public.map_shift_code(uuid, uuid, text, text, uuid), public.preview_import(uuid), public.apply_import(uuid),
  public.set_integration_secret(uuid, text), public.integration_source_has_secret(uuid), public.list_import_runs(uuid, integer)
  to authenticated;
revoke execute on function
  private.resolve_import(uuid), private.import_diff(uuid), private.purge_import_raw(), private.import_schedule(public.import_runs)
  from public, anon, authenticated;
grant execute on function private.require_import_access(uuid), private.integration_hospitals(), private.import_message(text, jsonb)
  to authenticated;
