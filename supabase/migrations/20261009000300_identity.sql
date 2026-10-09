-- =============================================================================
-- ShiftCare · 0300 · Identity: users, employees, qualifications, languages
--
-- auth.users (Supabase Auth, credentials & sessions)
--   └─ public.users          1:1 personal profile of a person (global)
--        └─ public.employees  N  employment of that person in one hospital
--             ├─ employee_units           ward memberships (one primary)
--             └─ employee_qualifications  → qualifications (per hospital)
--   └─ public.user_languages  spoken languages
--
-- A person can be employed by several hospitals (e.g. agency staff) without
-- duplicating personal data; every hospital only sees its own employment row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users (personal profile, 1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.users (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  first_name       text not null default '' check (char_length(first_name) <= 100),
  last_name        text not null default '' check (char_length(last_name) <= 100),
  avatar_path      text check (char_length(avatar_path) <= 512),
  phone            text check (char_length(phone) <= 40),
  preferred_locale text not null default 'de' references public.languages (code),
  theme            text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.users is
  'Personal profile of an authenticated person. Credentials live in auth.users.';

create index users_email_idx on public.users (lower(email));

create trigger users_set_updated_at
  before update on public.users
  for each row execute function private.set_updated_at();

-- Create / sync the profile whenever Supabase Auth creates or changes a user.
-- Works for email sign-up, invitations and OAuth (Google, Microsoft/Azure).
create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text  := btrim(coalesce(meta ->> 'full_name', meta ->> 'name', ''));
  locale    text  := meta ->> 'locale';
begin
  if tg_op = 'INSERT' then
    if locale is null or not exists (select 1 from public.languages l where l.code = locale and l.is_ui_available) then
      locale := 'de';
    end if;

    insert into public.users (id, email, first_name, last_name, preferred_locale)
    values (
      new.id,
      coalesce(new.email, ''),
      left(coalesce(meta ->> 'first_name', meta ->> 'given_name', split_part(full_name, ' ', 1)), 100),
      left(coalesce(meta ->> 'last_name', meta ->> 'family_name',
                    case when strpos(full_name, ' ') > 0 then substr(full_name, strpos(full_name, ' ') + 1) else '' end), 100),
      locale
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.users set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- -----------------------------------------------------------------------------
-- Employees (employment of a user in a hospital)
-- -----------------------------------------------------------------------------
create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  hospital_id      uuid not null references public.hospitals (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  personnel_number text check (char_length(personnel_number) <= 32),
  job_title        text not null default '' check (char_length(job_title) <= 120),
  employment_type  public.employment_type not null default 'full_time',
  weekly_hours     numeric(4, 1) check (weekly_hours between 0 and 80),
  status           public.employee_status not null default 'active',
  hire_date        date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (hospital_id, id),
  unique (hospital_id, user_id),
  unique (hospital_id, personnel_number)
);

comment on table public.employees is
  'Employment of a person in one hospital. All HR/scheduling data references employees, never users.';

create index employees_user_idx on public.employees (user_id) where status = 'active';

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Employee ↔ unit membership (an employee may work on several wards)
-- -----------------------------------------------------------------------------
create table public.employee_units (
  hospital_id uuid not null,
  employee_id uuid not null,
  unit_id     uuid not null,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (employee_id, unit_id),
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id) on delete cascade,
  foreign key (hospital_id, unit_id)     references public.units (hospital_id, id)     on delete cascade
);

create unique index employee_units_one_primary_idx on public.employee_units (employee_id) where is_primary;
create index employee_units_unit_idx on public.employee_units (unit_id);

-- -----------------------------------------------------------------------------
-- Spoken languages of a person
-- -----------------------------------------------------------------------------
create table public.user_languages (
  user_id       uuid not null references public.users (id) on delete cascade,
  language_code text not null references public.languages (code),
  proficiency   public.language_proficiency not null default 'fluent',
  primary key (user_id, language_code)
);

-- -----------------------------------------------------------------------------
-- Qualifications catalogue (per hospital) and employee qualifications
-- -----------------------------------------------------------------------------
create table public.qualifications (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  code        text not null check (char_length(code) between 1 and 32),
  name        text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 1000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (hospital_id, id),
  unique (hospital_id, code)
);

create trigger qualifications_set_updated_at
  before update on public.qualifications
  for each row execute function private.set_updated_at();

create table public.employee_qualifications (
  hospital_id      uuid not null,
  employee_id      uuid not null,
  qualification_id uuid not null,
  acquired_on      date,
  valid_until      date,
  document_id      uuid,  -- FK added in the documents migration
  verified_by      uuid references public.users (id) on delete set null,
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (employee_id, qualification_id),
  check (valid_until is null or acquired_on is null or valid_until >= acquired_on),
  foreign key (hospital_id, employee_id)      references public.employees (hospital_id, id)      on delete cascade,
  foreign key (hospital_id, qualification_id) references public.qualifications (hospital_id, id) on delete cascade
);

create index employee_qualifications_qualification_idx on public.employee_qualifications (qualification_id);
create index employee_qualifications_expiry_idx on public.employee_qualifications (hospital_id, valid_until) where valid_until is not null;

create trigger employee_qualifications_set_updated_at
  before update on public.employee_qualifications
  for each row execute function private.set_updated_at();
