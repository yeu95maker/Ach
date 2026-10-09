-- =============================================================================
-- ShiftCare · 0200 · Tenancy & organisational structure
--
-- hospital (tenant) ─┬─ departments ── units (wards)
--                    └─ (every tenant-owned row carries hospital_id)
--
-- Tenant integrity pattern: every tenant table exposes UNIQUE (hospital_id, id)
-- and children reference parents through the composite key
-- (hospital_id, parent_id). The database itself therefore makes it impossible
-- to link a row to a parent of another hospital — even for code running with
-- the service role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Languages (global reference data)
-- Used for UI localisation (is_ui_available) and for spoken languages on
-- employee profiles. Adding a language = one row + one translation file.
-- -----------------------------------------------------------------------------
create table public.languages (
  code            text primary key check (code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  name            text not null,
  native_name     text not null,
  is_ui_available boolean not null default false,
  is_active       boolean not null default true,
  sort_order      integer not null default 100
);

comment on table public.languages is
  'Global language catalogue. is_ui_available = the app ships a UI translation.';

insert into public.languages (code, name, native_name, is_ui_available, sort_order) values
  ('de', 'German',     'Deutsch',    true, 10),
  ('en', 'English',    'English',    true, 20),
  ('tr', 'Turkish',    'Türkçe',     true, 30),
  ('ro', 'Romanian',   'Română',     true, 40),
  ('pl', 'Polish',     'Polski',     true, 50),
  ('ar', 'Arabic',     'العربية',    false, 100),
  ('ru', 'Russian',    'Русский',    false, 100),
  ('uk', 'Ukrainian',  'Українська', false, 100),
  ('es', 'Spanish',    'Español',    false, 100),
  ('fr', 'French',     'Français',   false, 100),
  ('it', 'Italian',    'Italiano',   false, 100),
  ('hr', 'Croatian',   'Hrvatski',   false, 100),
  ('sr', 'Serbian',    'Српски',     false, 100),
  ('bg', 'Bulgarian',  'Български',  false, 100),
  ('el', 'Greek',      'Ελληνικά',   false, 100),
  ('fa', 'Persian',    'فارسی',      false, 100),
  ('tl', 'Tagalog',    'Tagalog',    false, 100),
  ('hi', 'Hindi',      'हिन्दी',       false, 100);

-- -----------------------------------------------------------------------------
-- Hospitals (tenants)
-- -----------------------------------------------------------------------------
create table public.hospitals (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 200),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  timezone       text not null default 'Europe/Berlin',
  default_locale text not null default 'de' references public.languages (code),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.hospitals is 'Tenant root. All tenant-owned data references hospitals.id.';

create trigger hospitals_set_updated_at
  before update on public.hospitals
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Departments (Fachabteilungen / Kliniken)
-- -----------------------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  code        text check (char_length(code) <= 32),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (hospital_id, id),
  unique (hospital_id, code)
);

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Units / wards (Stationen)
-- -----------------------------------------------------------------------------
create table public.units (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals (id) on delete cascade,
  department_id uuid not null,
  name          text not null check (char_length(name) between 1 and 200),
  code          text check (char_length(code) <= 32),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (hospital_id, id),
  unique (hospital_id, code),
  foreign key (hospital_id, department_id) references public.departments (hospital_id, id) on delete restrict
);

create index units_department_idx on public.units (department_id);

create trigger units_set_updated_at
  before update on public.units
  for each row execute function private.set_updated_at();
