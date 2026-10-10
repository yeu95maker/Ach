-- =============================================================================
-- ShiftCare · Wunschplan (2/2) · Tabellen, RLS, Workflows, Benachrichtigungen
--
-- A Wunschplan is a PREFERENCE, never a schedule. Wishes live in their own
-- tables and never write into schedule_entries. The official roster stays
-- under the control of authorised schedulers.
--
--   wish_preference_types   catalogue (Wunschfrei, Wunschnacht, …)
--   wish_plan_settings      configuration per hospital (unit_id NULL) or ward
--   wish_periods            submission window for one ward + scheduling period
--   wish_submissions        one per employee and period (general note)
--   wish_entries            one wish per day, each with its own status
--
-- Prepared for AI-assisted scheduling (suggestions only, humans approve):
--   staffing_requirements   required staffing per ward / shift type / weekday
--   schedule_suggestions    generated proposals, never applied automatically
--   get_scheduling_context  one call that returns every planning input
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissions & roles
-- -----------------------------------------------------------------------------
insert into public.permissions (key, scope, category, description) values
  ('wishes.submit', 'hospital', 'wishes', 'Submit own Wunschplan'),
  ('wishes.view',   'hospital', 'wishes', 'View Wunschpläne of employees in scope'),
  ('wishes.manage', 'hospital', 'wishes', 'Configure wish periods, deadlines and review wishes in scope')
on conflict (key) do nothing;

with matrix (role_key, permission_key) as (
  values
    ('nurse', 'wishes.submit'),
    ('charge_nurse', 'wishes.submit'),
    ('head_nurse', 'wishes.submit'), ('head_nurse', 'wishes.view'), ('head_nurse', 'wishes.manage'),
    ('hr', 'wishes.submit'),
    ('hospital_admin', 'wishes.view'), ('hospital_admin', 'wishes.manage')
)
insert into public.role_permissions (role_id, permission_key)
select r.id, m.permission_key
from matrix m join public.roles r on r.key = m.role_key and r.hospital_id is null
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Preference types (global catalogue; weight/flags prepared for AI scheduling)
-- -----------------------------------------------------------------------------
create table public.wish_preference_types (
  key                 text primary key check (key ~ '^[a-z_]{2,32}$'),
  shift_category      public.shift_category,          -- wish for a shift of this category
  requires_shift_type boolean not null default false, -- "Bevorzugter Dienst": concrete shift type
  wants_off           boolean not null default false, -- employee wants no shift that day
  weight              smallint not null default 1 check (weight between 1 and 3), -- 3 = strongest
  sort_order          integer not null default 100,
  is_active           boolean not null default true
);

comment on table public.wish_preference_types is
  'Kinds of wishes. Labels are translated in the client (wishType.<key>).';

insert into public.wish_preference_types (key, shift_category, requires_shift_type, wants_off, weight, sort_order) values
  ('free',        null,    false, true,  2, 10),  -- Wunschfrei
  ('night',       'night', false, false, 1, 20),  -- Wunschnacht
  ('early',       'early', false, false, 1, 30),  -- Wunschfrühdienst
  ('late',        'late',  false, false, 1, 40),  -- Wunschspätdienst
  ('preferred',   null,    true,  false, 1, 50),  -- Bevorzugter Dienst (konkreter Schichttyp)
  ('unavailable', null,    false, true,  3, 60);  -- Nicht verfügbar

-- -----------------------------------------------------------------------------
-- Configuration: hospital default (unit_id NULL) with optional ward override
-- -----------------------------------------------------------------------------
create table public.wish_plan_settings (
  id                           uuid primary key default gen_random_uuid(),
  hospital_id                  uuid not null references public.hospitals (id) on delete cascade,
  unit_id                      uuid,
  is_enabled                   boolean not null default true,
  allow_edit_after_submit      boolean not null default true,
  deadline_days_before_period  integer not null default 21 check (deadline_days_before_period between 0 and 120),
  reminder_days_before_deadline integer not null default 3 check (reminder_days_before_deadline between 0 and 30),
  max_wishes_per_period        integer check (max_wishes_per_period between 1 and 62),
  max_free_wishes              integer check (max_free_wishes between 0 and 62),
  updated_by                   uuid references public.users (id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique nulls not distinct (hospital_id, unit_id),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade
);

create trigger wish_plan_settings_set_updated_at
  before update on public.wish_plan_settings
  for each row execute function private.set_updated_at();

-- Effective settings for a ward: ward override → hospital default → built-in defaults.
create or replace function private.wish_settings(p_unit_id uuid)
returns public.wish_plan_settings
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select s from public.wish_plan_settings s where s.unit_id = p_unit_id),
    (select s from public.wish_plan_settings s
       join public.units u on u.hospital_id = s.hospital_id and u.id = p_unit_id
      where s.unit_id is null),
    (select row(null, u.hospital_id, p_unit_id, true, true, 21, 3, null, null, null, now(), now())::public.wish_plan_settings
       from public.units u where u.id = p_unit_id)
  )
$$;

-- -----------------------------------------------------------------------------
-- Wish periods
-- -----------------------------------------------------------------------------
create table public.wish_periods (
  id                      uuid primary key default gen_random_uuid(),
  hospital_id             uuid not null references public.hospitals (id) on delete cascade,
  unit_id                 uuid not null,
  period_start            date not null,
  period_end              date not null,
  opens_at                timestamptz,              -- NULL = open manually
  deadline_at             timestamptz not null,
  status                  public.wish_period_status not null default 'draft',
  allow_edit_after_submit boolean not null default true,
  reminder_sent_at        timestamptz,
  locked_at               timestamptz,
  reopened_at             timestamptz,
  reopened_by             uuid references public.users (id) on delete set null,
  created_by              uuid references public.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (hospital_id, id),
  check (period_end >= period_start and period_end - period_start <= 62),
  check (opens_at is null or opens_at < deadline_at),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade,
  constraint wish_periods_no_overlap exclude using gist (
    unit_id with =,
    daterange(period_start, period_end, '[]') with &&
  ) where (status <> 'archived')
);

create index wish_periods_unit_idx on public.wish_periods (unit_id, period_start desc);
create index wish_periods_jobs_idx on public.wish_periods (status, deadline_at) where status in ('draft', 'open');

create trigger wish_periods_set_updated_at
  before update on public.wish_periods
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Submissions & entries
-- -----------------------------------------------------------------------------
create table public.wish_submissions (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null,
  period_id    uuid not null,
  employee_id  uuid not null,
  note         text check (char_length(note) <= 1000),
  submitted_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hospital_id, id),
  unique (period_id, employee_id),
  unique (id, period_id, employee_id),
  foreign key (hospital_id, period_id)   references public.wish_periods (hospital_id, id) on delete cascade,
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id)    on delete cascade
);

create trigger wish_submissions_set_updated_at
  before update on public.wish_submissions
  for each row execute function private.set_updated_at();

create table public.wish_entries (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null,
  submission_id   uuid not null,
  period_id       uuid not null,
  employee_id     uuid not null,
  wish_date       date not null,
  preference_type text not null references public.wish_preference_types (key),
  shift_type_id   uuid,
  note            text check (char_length(note) <= 300),
  status          public.wish_status not null default 'submitted',
  reviewed_by     uuid references public.users (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (char_length(review_note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (submission_id, wish_date),
  -- period/employee are denormalised for fast filtering, kept consistent by FK:
  foreign key (submission_id, period_id, employee_id) references public.wish_submissions (id, period_id, employee_id) on delete cascade,
  foreign key (hospital_id, shift_type_id) references public.shift_types (hospital_id, id) on delete restrict
);

comment on table public.wish_entries is
  'One wish per employee and day. A preference only – never a confirmed shift.';

create index wish_entries_period_date_idx on public.wish_entries (period_id, wish_date);
create index wish_entries_employee_idx    on public.wish_entries (employee_id, wish_date);

create trigger wish_entries_set_updated_at
  before update on public.wish_entries
  for each row execute function private.set_updated_at();

create or replace function private.wish_entry_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.wish_periods;
  t public.wish_preference_types;
begin
  select * into p from public.wish_periods where id = new.period_id;
  if new.wish_date not between p.period_start and p.period_end then
    raise exception 'Wish date % is outside of the wish period', new.wish_date using errcode = '23514';
  end if;
  select * into t from public.wish_preference_types where key = new.preference_type;
  if t.requires_shift_type and new.shift_type_id is null then
    raise exception 'Preference % needs a shift type', new.preference_type using errcode = '23514';
  end if;
  if not t.requires_shift_type then
    new.shift_type_id := null;
  end if;
  return new;
end;
$$;

create trigger wish_entries_validate
  before insert or update on public.wish_entries
  for each row execute function private.wish_entry_validate();

-- -----------------------------------------------------------------------------
-- AI preparation: staffing requirements & suggestions
-- -----------------------------------------------------------------------------
create table public.staffing_requirements (
  id                        uuid primary key default gen_random_uuid(),
  hospital_id               uuid not null references public.hospitals (id) on delete cascade,
  unit_id                   uuid not null,
  shift_type_id             uuid not null,
  weekday                   smallint check (weekday between 1 and 7),  -- ISO weekday, NULL = every day
  min_staff                 integer not null check (min_staff >= 0),
  target_staff              integer check (target_staff >= min_staff),
  required_qualification_id uuid,
  valid_from                date,
  valid_to                  date,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  foreign key (hospital_id, unit_id)                   references public.units (hospital_id, id)          on delete cascade,
  foreign key (hospital_id, shift_type_id)             references public.shift_types (hospital_id, id)    on delete cascade,
  foreign key (hospital_id, required_qualification_id) references public.qualifications (hospital_id, id) on delete set null
);

create index staffing_requirements_unit_idx on public.staffing_requirements (unit_id);

create trigger staffing_requirements_set_updated_at
  before update on public.staffing_requirements
  for each row execute function private.set_updated_at();

create table public.schedule_suggestions (
  id             uuid primary key default gen_random_uuid(),
  hospital_id    uuid not null references public.hospitals (id) on delete cascade,
  unit_id        uuid not null,
  schedule_id    uuid,
  period_start   date not null,
  period_end     date not null,
  generator      text not null check (generator in ('ai', 'rules', 'manual')),
  model          text check (char_length(model) <= 120),
  input_snapshot jsonb not null default '{}'::jsonb,  -- what the generator saw (traceability)
  suggestion     jsonb not null,                      -- proposed entries + explanations
  score          jsonb,                               -- fulfilled wishes, rule violations …
  status         public.suggestion_status not null default 'proposed',
  created_by     uuid references public.users (id) on delete set null,
  decided_by     uuid references public.users (id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (period_end >= period_start),
  check ((status in ('accepted', 'rejected')) = (decided_at is not null)),
  foreign key (hospital_id, unit_id)     references public.units (hospital_id, id)     on delete cascade,
  foreign key (hospital_id, schedule_id) references public.schedules (hospital_id, id) on delete set null
);

comment on table public.schedule_suggestions is
  'Proposals from a scheduling assistant. Never applied automatically – a human decides; '
  'applying a suggestion means creating schedule_entries explicitly.';

create index schedule_suggestions_unit_idx on public.schedule_suggestions (unit_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['wish_plan_settings', 'wish_periods', 'wish_submissions', 'wish_entries',
                           'staffing_requirements', 'schedule_suggestions'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Wish periods whose ward is covered by the caller's grant of `p`.
create or replace function private.wish_period_ids_with_permission(p text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select wp.id from public.wish_periods wp
  where wp.unit_id in (select private.units_with_permission(p))
$$;

-- Active members of a ward (recipients for Wunschplan notifications).
create or replace function private.unit_member_user_ids(p_unit_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct e.user_id
  from public.employee_units eu
  join public.employees e on e.id = eu.employee_id and e.status = 'active'
  where eu.unit_id = p_unit_id
$$;

grant execute on function private.wish_settings(uuid), private.wish_period_ids_with_permission(text) to authenticated;
revoke execute on function private.unit_member_user_ids(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.wish_preference_types enable row level security;
alter table public.wish_plan_settings    enable row level security;
alter table public.wish_periods          enable row level security;
alter table public.wish_submissions      enable row level security;
alter table public.wish_entries          enable row level security;
alter table public.staffing_requirements enable row level security;
alter table public.schedule_suggestions  enable row level security;

revoke all on public.wish_preference_types, public.wish_plan_settings, public.wish_periods, public.wish_submissions,
              public.wish_entries, public.staffing_requirements, public.schedule_suggestions from anon;
revoke insert, update, delete, truncate, references, trigger
    on public.wish_preference_types, public.wish_plan_settings, public.wish_periods, public.wish_submissions,
       public.wish_entries, public.staffing_requirements, public.schedule_suggestions from authenticated;

create policy wish_preference_types_select on public.wish_preference_types
  for select to authenticated using (true);

-- settings
grant insert (hospital_id, unit_id, is_enabled, allow_edit_after_submit, deadline_days_before_period,
              reminder_days_before_deadline, max_wishes_per_period, max_free_wishes),
      update (is_enabled, allow_edit_after_submit, deadline_days_before_period, reminder_days_before_deadline,
              max_wishes_per_period, max_free_wishes),
      delete
  on public.wish_plan_settings to authenticated;

create policy wish_plan_settings_select on public.wish_plan_settings
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy wish_plan_settings_write on public.wish_plan_settings
  for all to authenticated
  using (
    (unit_id is null and hospital_id in (select private.hospitals_with_permission('wishes.manage')))
    or unit_id in (select private.units_with_permission('wishes.manage'))
  )
  with check (
    (unit_id is null and hospital_id in (select private.hospitals_with_permission('wishes.manage')))
    or unit_id in (select private.units_with_permission('wishes.manage'))
  );

-- periods
grant insert (hospital_id, unit_id, period_start, period_end, opens_at, deadline_at, allow_edit_after_submit),
      update (period_start, period_end, opens_at, deadline_at, allow_edit_after_submit, status),
      delete
  on public.wish_periods to authenticated;

create policy wish_periods_select on public.wish_periods
  for select to authenticated
  using (
    (status <> 'draft'
       and unit_id in (select private.my_unit_ids())
       and hospital_id in (select private.hospitals_with_any_permission('wishes.submit')))
    or unit_id in (select private.units_with_permission('wishes.view'))
    or unit_id in (select private.units_with_permission('wishes.manage'))
  );

create policy wish_periods_insert on public.wish_periods
  for insert to authenticated
  with check (unit_id in (select private.units_with_permission('wishes.manage')));

create policy wish_periods_update on public.wish_periods
  for update to authenticated
  using (unit_id in (select private.units_with_permission('wishes.manage')))
  with check (unit_id in (select private.units_with_permission('wishes.manage')));

create policy wish_periods_delete on public.wish_periods
  for delete to authenticated
  using (status = 'draft' and unit_id in (select private.units_with_permission('wishes.manage')));

-- submissions & entries: read only via RLS, writes only through RPCs
create policy wish_submissions_select on public.wish_submissions
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or period_id in (select private.wish_period_ids_with_permission('wishes.view'))
    or period_id in (select private.wish_period_ids_with_permission('wishes.manage'))
  );

create policy wish_entries_select on public.wish_entries
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or period_id in (select private.wish_period_ids_with_permission('wishes.view'))
    or period_id in (select private.wish_period_ids_with_permission('wishes.manage'))
  );

-- AI preparation
grant insert (hospital_id, unit_id, shift_type_id, weekday, min_staff, target_staff, required_qualification_id, valid_from, valid_to),
      update (weekday, min_staff, target_staff, required_qualification_id, valid_from, valid_to),
      delete
  on public.staffing_requirements to authenticated;

create policy staffing_requirements_select on public.staffing_requirements
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy staffing_requirements_write on public.staffing_requirements
  for all to authenticated
  using (unit_id in (select private.units_with_permission('schedule.manage'))
         or hospital_id in (select private.hospitals_with_permission('organization.manage')))
  with check (unit_id in (select private.units_with_permission('schedule.manage'))
              or hospital_id in (select private.hospitals_with_permission('organization.manage')));

grant insert (hospital_id, unit_id, schedule_id, period_start, period_end, generator, model, input_snapshot, suggestion, score)
  on public.schedule_suggestions to authenticated;

create policy schedule_suggestions_select on public.schedule_suggestions
  for select to authenticated
  using (unit_id in (select private.units_with_permission('schedule.manage')));

create policy schedule_suggestions_insert on public.schedule_suggestions
  for insert to authenticated
  with check (status = 'proposed' and unit_id in (select private.units_with_permission('schedule.manage')));

-- -----------------------------------------------------------------------------
-- Period lifecycle: validation, stamps, entry locking, notifications
-- -----------------------------------------------------------------------------
create or replace function private.wish_period_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.status := 'draft';
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (   (old.status = 'draft'  and new.status in ('open', 'archived'))
            or (old.status = 'open'   and new.status in ('locked', 'archived'))
            or (old.status = 'locked' and new.status in ('open', 'archived'))) then
      raise exception 'Invalid wish period transition % → %', old.status, new.status using errcode = '22023';
    end if;
    if new.status = 'open' and new.deadline_at <= now() then
      raise exception 'Deadline must be in the future to open the Wunschplan' using errcode = '22023';
    end if;
    if new.status = 'locked' then
      new.locked_at := now();
    end if;
    if old.status = 'locked' and new.status = 'open' then
      new.reopened_at := now();
      new.reopened_by := (select auth.uid());
      new.reminder_sent_at := null;
    end if;
  end if;

  if old.status <> 'draft' and (new.period_start <> old.period_start or new.period_end <> old.period_end) then
    raise exception 'The period of a published Wunschplan cannot be changed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger wish_periods_before_write
  before insert or update on public.wish_periods
  for each row execute function private.wish_period_before_write();

create or replace function private.wish_period_after_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'period_id', new.id,
    'unit_name', (select u.name from public.units u where u.id = new.unit_id),
    'period_start', new.period_start,
    'period_end', new.period_end,
    'deadline_at', new.deadline_at,
    'reopened', old.status = 'locked');

  if new.status = 'open' then
    update public.wish_entries set status = 'submitted'
     where period_id = new.id and status = 'locked';
    perform private.notify_users(new.hospital_id, array(select private.unit_member_user_ids(new.unit_id)),
                                 'wish_plan_opened', v_payload, 'wish_period', new.id);
  elsif new.status = 'locked' then
    update public.wish_entries set status = 'locked'
     where period_id = new.id and status = 'submitted';
    perform private.notify_users(new.hospital_id, array(select private.unit_member_user_ids(new.unit_id)),
                                 'wish_plan_locked', v_payload, 'wish_period', new.id);
  end if;
  return null;
end;
$$;

create trigger wish_periods_after_status
  after update of status on public.wish_periods
  for each row execute function private.wish_period_after_status();

-- -----------------------------------------------------------------------------
-- RPC: submit / change own Wunschplan
--   p_entries: [{ "date": "2026-11-12", "type": "free", "shift_type_id": null, "note": "…" }, …]
-- -----------------------------------------------------------------------------
create or replace function public.submit_wish_plan(p_period_id uuid, p_entries jsonb, p_note text default null)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  p          public.wish_periods;
  s          public.wish_plan_settings;
  v_employee uuid;
  v_sub      public.wish_submissions;
  v_existing boolean;
  v_count    integer;
  v_free     integer;
begin
  select * into p from public.wish_periods where id = p_period_id for update;
  if p.id is null then
    raise exception 'Unknown wish period' using errcode = '42501';
  end if;

  select e.id into v_employee
  from public.employees e
  join public.employee_units eu on eu.employee_id = e.id and eu.unit_id = p.unit_id
  where e.user_id = (select auth.uid()) and e.status = 'active' and e.hospital_id = p.hospital_id;

  if v_employee is null or p.hospital_id not in (select private.hospitals_with_any_permission('wishes.submit')) then
    raise exception 'Not allowed to submit a Wunschplan for this ward' using errcode = '42501';
  end if;
  if p.status <> 'open' or now() > p.deadline_at then
    raise exception 'The Wunschplan is closed' using errcode = '22023';
  end if;

  select * into v_sub from public.wish_submissions where period_id = p.id and employee_id = v_employee;
  v_existing := v_sub.id is not null;
  if v_existing and not p.allow_edit_after_submit then
    raise exception 'The Wunschplan was already submitted and cannot be changed' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'Entries must be an array' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Note too long' using errcode = '22001';
  end if;

  s := private.wish_settings(p.unit_id);
  if not s.is_enabled then
    raise exception 'Wunschplan is disabled for this ward' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where x ->> 'type' = 'free')
    into v_count, v_free
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) x;
  if s.max_wishes_per_period is not null and v_count > s.max_wishes_per_period then
    raise exception 'Too many wishes (max %)', s.max_wishes_per_period using errcode = '22023';
  end if;
  if s.max_free_wishes is not null and v_free > s.max_free_wishes then
    raise exception 'Too many "Wunschfrei" (max %)', s.max_free_wishes using errcode = '22023';
  end if;

  if v_existing then
    update public.wish_submissions set note = nullif(btrim(p_note), ''), submitted_at = now()
     where id = v_sub.id returning * into v_sub;
  else
    insert into public.wish_submissions (hospital_id, period_id, employee_id, note)
    values (p.hospital_id, p.id, v_employee, nullif(btrim(p_note), ''))
    returning * into v_sub;
  end if;

  -- Remove wishes for days that are no longer selected …
  delete from public.wish_entries we
   where we.submission_id = v_sub.id
     and we.wish_date not in (select (x ->> 'date')::date from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) x);

  -- … and upsert the rest. A changed wish starts over as "submitted".
  insert into public.wish_entries (hospital_id, submission_id, period_id, employee_id, wish_date, preference_type, shift_type_id, note)
  select p.hospital_id, v_sub.id, p.id, v_employee,
         (x ->> 'date')::date, x ->> 'type', nullif(x ->> 'shift_type_id', '')::uuid,
         nullif(btrim(left(x ->> 'note', 300)), '')
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) x
  on conflict (submission_id, wish_date) do update
     set preference_type = excluded.preference_type,
         shift_type_id   = excluded.shift_type_id,
         note            = excluded.note,
         status          = case
                             when (public.wish_entries.preference_type, public.wish_entries.shift_type_id, public.wish_entries.note)
                                  is distinct from (excluded.preference_type, excluded.shift_type_id, excluded.note)
                             then 'submitted'::public.wish_status
                             else public.wish_entries.status
                           end,
         reviewed_by     = case when (public.wish_entries.preference_type, public.wish_entries.shift_type_id, public.wish_entries.note)
                                     is distinct from (excluded.preference_type, excluded.shift_type_id, excluded.note)
                                then null else public.wish_entries.reviewed_by end,
         reviewed_at     = case when (public.wish_entries.preference_type, public.wish_entries.shift_type_id, public.wish_entries.note)
                                     is distinct from (excluded.preference_type, excluded.shift_type_id, excluded.note)
                                then null else public.wish_entries.reviewed_at end;

  -- Confirmation for the employee (explicitly addressed to the actor).
  insert into public.notifications (hospital_id, recipient_id, type, payload, entity_type, entity_id)
  values (p.hospital_id, (select auth.uid()), 'wish_plan_submitted',
          jsonb_build_object('period_id', p.id, 'period_start', p.period_start, 'period_end', p.period_end,
                             'count', v_count, 'updated', v_existing,
                             'unit_name', (select u.name from public.units u where u.id = p.unit_id)),
          'wish_period', p.id);

  return v_sub.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: schedulers review wishes (one notification per affected employee)
-- -----------------------------------------------------------------------------
create or replace function public.review_wishes(p_entry_ids uuid[], p_status public.wish_status, p_note text default null)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_status not in ('under_review', 'considered', 'not_considered') then
    raise exception 'Invalid review status %', p_status using errcode = '22023';
  end if;
  if exists (
    select 1 from public.wish_entries we
    where we.id = any (p_entry_ids)
      and (we.period_id not in (select private.wish_period_ids_with_permission('wishes.manage'))
           or we.employee_id in (select private.my_employee_ids()))
  ) then
    raise exception 'Not allowed to review these wishes' using errcode = '42501';
  end if;

  with updated as (
    update public.wish_entries
       set status = p_status,
           reviewed_by = (select auth.uid()),
           reviewed_at = now(),
           review_note = nullif(btrim(p_note), '')
     where id = any (p_entry_ids)
    returning hospital_id, period_id, employee_id
  ),
  per_employee as (
    select u.hospital_id, u.period_id, e.user_id, count(*) as n
    from updated u join public.employees e on e.id = u.employee_id
    group by 1, 2, 3
  ),
  notified as (
    insert into public.notifications (hospital_id, recipient_id, type, payload, entity_type, entity_id)
    select pe.hospital_id, pe.user_id, 'wish_plan_reviewed',
           jsonb_build_object('period_id', wp.id, 'period_start', wp.period_start, 'period_end', wp.period_end,
                              'count', pe.n, 'status', p_status,
                              'unit_name', (select un.name from public.units un where un.id = wp.unit_id)),
           'wish_period', wp.id
    from per_employee pe join public.wish_periods wp on wp.id = pe.period_id
    where p_status in ('considered', 'not_considered')
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scheduled jobs (pg_cron): open, remind, lock
-- -----------------------------------------------------------------------------
create or replace function private.run_wish_plan_jobs()
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_opened   integer;
  v_reminded integer := 0;
  v_locked   integer;
  r          record;
begin
  -- 1. open periods whose opening time has come
  with o as (
    update public.wish_periods set status = 'open'
     where status = 'draft' and opens_at is not null and opens_at <= now() and deadline_at > now()
    returning 1)
  select count(*) into v_opened from o;

  -- 2. remind employees who have not submitted yet
  for r in
    select wp.*
    from public.wish_periods wp
    where wp.status = 'open' and wp.reminder_sent_at is null and wp.deadline_at > now()
      and wp.deadline_at <= now() + make_interval(days => (private.wish_settings(wp.unit_id)).reminder_days_before_deadline)
  loop
    perform private.notify_users(
      r.hospital_id,
      array(
        select uid from private.unit_member_user_ids(r.unit_id) uid
        where not exists (
          select 1 from public.wish_submissions ws
          join public.employees e on e.id = ws.employee_id
          where ws.period_id = r.id and e.user_id = uid)),
      'wish_plan_deadline',
      jsonb_build_object('period_id', r.id, 'period_start', r.period_start, 'period_end', r.period_end,
                         'deadline_at', r.deadline_at,
                         'unit_name', (select u.name from public.units u where u.id = r.unit_id)),
      'wish_period', r.id);
    update public.wish_periods set reminder_sent_at = now() where id = r.id;
    v_reminded := v_reminded + 1;
  end loop;

  -- 3. lock periods after the deadline
  with l as (
    update public.wish_periods set status = 'locked'
     where status = 'open' and deadline_at <= now()
    returning 1)
  select count(*) into v_locked from l;

  return jsonb_build_object('opened', v_opened, 'reminded', v_reminded, 'locked', v_locked);
end;
$$;

revoke execute on function private.run_wish_plan_jobs() from public, anon, authenticated;

-- Schedule every 15 minutes where pg_cron is available (Supabase: enable in Dashboard → Integrations → Cron).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('shiftcare-wish-plan-jobs', '*/15 * * * *', 'select private.run_wish_plan_jobs()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- View for schedulers: wishes with person, ward and department
-- -----------------------------------------------------------------------------
create or replace view public.wish_overview
with (security_invoker = true)
as
select
  we.id,
  we.hospital_id,
  we.period_id,
  wp.unit_id,
  un.name           as unit_name,
  un.department_id,
  dp.name           as department_name,
  we.employee_id,
  d.first_name,
  d.last_name,
  d.avatar_path,
  d.job_title,
  we.wish_date,
  we.preference_type,
  we.shift_type_id,
  st.code           as shift_code,
  st.name           as shift_name,
  we.note,
  we.status,
  we.reviewed_at,
  we.review_note,
  ws.note           as submission_note,
  ws.submitted_at
from public.wish_entries we
join public.wish_periods wp      on wp.id = we.period_id
join public.wish_submissions ws  on ws.id = we.submission_id
join public.units un             on un.id = wp.unit_id
join public.departments dp       on dp.id = un.department_id
left join public.shift_types st  on st.id = we.shift_type_id
left join public.employee_directory d on d.employee_id = we.employee_id;

grant select on public.wish_overview to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: everything a (future) scheduling assistant needs, in one call.
-- Read-only; suggestions are stored in schedule_suggestions for human review.
-- -----------------------------------------------------------------------------
create or replace function public.get_scheduling_context(p_unit_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_hospital uuid;
begin
  if not private.has_unit_permission('schedule.manage', p_unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Invalid range' using errcode = '22023';
  end if;
  select hospital_id into v_hospital from public.units where id = p_unit_id;

  return jsonb_build_object(
    'unit_id', p_unit_id,
    'from', p_from,
    'to', p_to,
    'timezone', (select timezone from public.hospitals where id = v_hospital),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'code', st.code, 'category', st.category,
                                          'start_time', st.start_time, 'end_time', st.end_time, 'break_minutes', st.break_minutes))
      from public.shift_types st
      where st.hospital_id = v_hospital and st.is_active and (st.unit_id is null or st.unit_id = p_unit_id)), '[]'::jsonb),
    'staffing_requirements', coalesce((
      select jsonb_agg(to_jsonb(sr) - 'created_at' - 'updated_at')
      from public.staffing_requirements sr
      where sr.unit_id = p_unit_id
        and (sr.valid_from is null or sr.valid_from <= p_to) and (sr.valid_to is null or sr.valid_to >= p_from)), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id,
        'employment_type', e.employment_type,
        'weekly_hours', e.weekly_hours,
        'qualification_ids', coalesce((select jsonb_agg(eq.qualification_id) from public.employee_qualifications eq
                                        where eq.employee_id = e.id and (eq.valid_until is null or eq.valid_until >= p_from)), '[]'::jsonb)))
      from public.employees e
      join public.employee_units eu on eu.employee_id = e.id and eu.unit_id = p_unit_id
      where e.status = 'active'), '[]'::jsonb),
    'wishes', coalesce((
      select jsonb_agg(jsonb_build_object('employee_id', we.employee_id, 'date', we.wish_date, 'type', we.preference_type,
                                          'shift_type_id', we.shift_type_id, 'weight', t.weight, 'status', we.status))
      from public.wish_entries we
      join public.wish_periods wp on wp.id = we.period_id and wp.unit_id = p_unit_id
      join public.wish_preference_types t on t.key = we.preference_type
      where we.wish_date between p_from and p_to), '[]'::jsonb),
    'absences', coalesce((
      select jsonb_agg(a) from (
        select jsonb_build_object('employee_id', lr.employee_id, 'kind', 'leave', 'start', lr.start_date, 'end', lr.end_date) a
        from public.leave_requests lr
        join public.employee_units eu on eu.employee_id = lr.employee_id and eu.unit_id = p_unit_id
        where lr.status = 'approved' and lr.start_date <= p_to and lr.end_date >= p_from
        union all
        select jsonb_build_object('employee_id', sl.employee_id, 'kind', 'sick', 'start', sl.start_date, 'end', sl.end_date)
        from public.sick_leaves sl
        join public.employee_units eu on eu.employee_id = sl.employee_id and eu.unit_id = p_unit_id
        where sl.status in ('reported', 'acknowledged') and sl.start_date <= p_to and sl.end_date >= p_from
      ) x), '[]'::jsonb),
    'assigned_shifts', coalesce((
      select jsonb_agg(jsonb_build_object('employee_id', se.employee_id, 'date', se.entry_date, 'kind', se.kind,
                                          'shift_type_id', se.shift_type_id, 'starts_at', se.starts_at, 'ends_at', se.ends_at,
                                          'schedule_status', s.status))
      from public.schedule_entries se
      join public.schedules s on s.id = se.schedule_id
      where se.employee_id in (select eu.employee_id from public.employee_units eu where eu.unit_id = p_unit_id)
        and se.entry_date between p_from - 7 and p_to), '[]'::jsonb)  -- one week before: rest periods
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: on which wards may the caller view / manage Wunschpläne?
-- -----------------------------------------------------------------------------
create or replace function public.my_wish_scope()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'view_unit_ids',   coalesce((select jsonb_agg(u) from (select private.units_with_permission('wishes.view') u
                                                           union select private.units_with_permission('wishes.manage')) x), '[]'::jsonb),
    'manage_unit_ids', coalesce((select jsonb_agg(u) from private.units_with_permission('wishes.manage') u), '[]'::jsonb)
  )
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  public.submit_wish_plan(uuid, jsonb, text),
  public.review_wishes(uuid[], public.wish_status, text),
  public.get_scheduling_context(uuid, date, date),
  public.my_wish_scope()
from public, anon;

grant execute on function
  public.submit_wish_plan(uuid, jsonb, text),
  public.review_wishes(uuid[], public.wish_status, text),
  public.get_scheduling_context(uuid, date, date),
  public.my_wish_scope()
to authenticated;
