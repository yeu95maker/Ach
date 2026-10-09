-- =============================================================================
-- ShiftCare · 0500 · Scheduling
--
-- shift_types        configurable shift templates per hospital (optionally per ward)
-- schedules          one roster per ward and period, lifecycle draft → published → archived
-- schedule_entries   one assignment (shift / day off / open shift) per employee and day
--
-- Vacation and sickness are NOT stored as schedule entries; they live in
-- leave_requests / sick_leaves and are overlaid by the client. This avoids
-- two sources of truth for absences.
-- =============================================================================

create table public.shift_types (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals (id) on delete cascade,
  unit_id       uuid,
  code          text not null check (code ~ '^[A-Za-z0-9_-]{1,16}$'),
  name          text not null check (char_length(name) between 1 and 80),
  category      public.shift_category not null,
  start_time    time not null,
  end_time      time not null,
  break_minutes integer not null default 30 check (break_minutes between 0 and 240),
  color         text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active     boolean not null default true,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (start_time <> end_time),
  unique (hospital_id, id),
  unique nulls not distinct (hospital_id, unit_id, code),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade
);

comment on column public.shift_types.end_time is
  'If end_time <= start_time the shift ends on the following day (night shift).';

create trigger shift_types_set_updated_at
  before update on public.shift_types
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
create table public.schedules (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals (id) on delete cascade,
  unit_id      uuid not null,
  period_start date not null,
  period_end   date not null,
  status       public.schedule_status not null default 'draft',
  version      integer not null default 0,
  published_at timestamptz,
  published_by uuid references public.users (id) on delete set null,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hospital_id, id),
  check (period_end >= period_start and period_end - period_start <= 62),
  check (status <> 'published' or published_at is not null),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade,
  -- One active roster per ward and day.
  constraint schedules_no_overlap exclude using gist (
    unit_id with =,
    daterange(period_start, period_end, '[]') with &&
  ) where (status <> 'archived')
);

create index schedules_unit_period_idx on public.schedules (unit_id, period_start desc);

create trigger schedules_set_updated_at
  before update on public.schedules
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
create table public.schedule_entries (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null,
  schedule_id   uuid not null,
  employee_id   uuid,              -- NULL = open shift (to be filled)
  kind          public.schedule_entry_kind not null default 'shift',
  shift_type_id uuid,
  entry_date    date not null,
  starts_at     timestamptz,
  ends_at       timestamptz,
  note          text check (char_length(note) <= 500),
  created_by    uuid references public.users (id) on delete set null,
  updated_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (hospital_id, id),
  foreign key (hospital_id, schedule_id)   references public.schedules (hospital_id, id)   on delete cascade,
  foreign key (hospital_id, employee_id)   references public.employees (hospital_id, id)   on delete cascade,
  foreign key (hospital_id, shift_type_id) references public.shift_types (hospital_id, id) on delete restrict,
  check (
    (kind = 'shift' and starts_at is not null and ends_at is not null and ends_at > starts_at
                    and ends_at - starts_at <= interval '24 hours')
    or (kind = 'off' and employee_id is not null and shift_type_id is null and starts_at is null and ends_at is null)
  ),
  -- An employee can never be in two places at once.
  constraint schedule_entries_no_double_booking exclude using gist (
    employee_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (kind = 'shift' and employee_id is not null)
);

comment on column public.schedule_entries.starts_at is
  'Materialised from shift type + entry_date in the hospital time zone (overridable). Enables fast "who is on duty now" queries.';

create index schedule_entries_schedule_idx      on public.schedule_entries (schedule_id, entry_date);
create index schedule_entries_employee_date_idx on public.schedule_entries (employee_id, entry_date);
create index schedule_entries_hospital_time_idx on public.schedule_entries (hospital_id, starts_at, ends_at) where kind = 'shift';
create index schedule_entries_open_idx          on public.schedule_entries (hospital_id, entry_date) where employee_id is null;
create unique index schedule_entries_one_off_per_day_idx
  on public.schedule_entries (employee_id, entry_date) where kind = 'off';

-- Fill starts_at/ends_at from the shift type and guarantee the entry lies in
-- the schedule period.
create or replace function private.schedule_entry_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s  public.schedules;
  st public.shift_types;
  tz text;
begin
  select * into s from public.schedules where id = new.schedule_id;
  if new.entry_date not between s.period_start and s.period_end then
    raise exception 'Entry date % is outside of the schedule period', new.entry_date using errcode = '23514';
  end if;

  if new.kind = 'shift' and new.shift_type_id is not null
     and (new.starts_at is null or new.ends_at is null
          or (tg_op = 'UPDATE' and (new.shift_type_id is distinct from old.shift_type_id
                                    or new.entry_date is distinct from old.entry_date)
              and new.starts_at is not distinct from old.starts_at)) then
    select * into st from public.shift_types where id = new.shift_type_id;
    select h.timezone into tz from public.hospitals h where h.id = new.hospital_id;

    new.starts_at := (new.entry_date + st.start_time) at time zone tz;
    new.ends_at   := (new.entry_date + st.end_time
                      + case when st.end_time <= st.start_time then interval '1 day' else interval '0' end)
                     at time zone tz;
  end if;

  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  end if;
  return new;
end;
$$;

create trigger schedule_entries_prepare
  before insert or update on public.schedule_entries
  for each row execute function private.schedule_entry_prepare();

create trigger schedule_entries_set_updated_at
  before update on public.schedule_entries
  for each row execute function private.set_updated_at();
