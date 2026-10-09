-- =============================================================================
-- ShiftCare · 0400 · Role based access control
--
-- permissions ──< role_permissions >── roles ──< employee_roles >── employees
--                                          └──< platform_role_assignments >── users
--
-- * Permissions are fine-grained capability keys ("leave.approve").
-- * Roles bundle permissions. Built-in roles have hospital_id = NULL and are
--   shared by all tenants; hospitals can add their own custom roles.
-- * An assignment grants a role to an employee, optionally limited to one
--   department or one unit (ward). No scope = whole hospital.
-- * Application code and RLS only ever check PERMISSIONS, never role names,
--   so new roles can be added without touching code.
-- =============================================================================

create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  scope       public.role_scope not null default 'hospital',
  category    text not null,
  description text not null
);

comment on table public.permissions is 'Capability catalogue. Checked by RLS policies and RPCs.';

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals (id) on delete cascade,
  key         text not null check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name        text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  scope       public.role_scope not null default 'hospital',
  is_system   boolean not null default false,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (hospital_id, key),
  check (scope = 'hospital' or hospital_id is null),
  check (not is_system or hospital_id is null)
);

comment on table public.roles is
  'Permission bundles. hospital_id NULL = built-in role available to every hospital.';

create index roles_hospital_idx on public.roles (hospital_id);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on update cascade on delete cascade,
  primary key (role_id, permission_key)
);

create index role_permissions_permission_idx on public.role_permissions (permission_key);

create table public.employee_roles (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null,
  employee_id   uuid not null,
  role_id       uuid not null references public.roles (id) on delete cascade,
  department_id uuid,
  unit_id       uuid,
  valid_until   timestamptz,
  granted_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (department_id is null or unit_id is null),
  unique nulls not distinct (employee_id, role_id, department_id, unit_id),
  foreign key (hospital_id, employee_id)   references public.employees (hospital_id, id)   on delete cascade,
  foreign key (hospital_id, department_id) references public.departments (hospital_id, id) on delete cascade,
  foreign key (hospital_id, unit_id)       references public.units (hospital_id, id)       on delete cascade
);

comment on table public.employee_roles is
  'Role assignment. department_id/unit_id NULL = hospital-wide scope.';

create index employee_roles_role_idx on public.employee_roles (role_id);
create index employee_roles_hospital_idx on public.employee_roles (hospital_id);

create table public.platform_role_assignments (
  user_id    uuid not null references public.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

comment on table public.platform_role_assignments is
  'Platform-level roles (e.g. system administrator of the ShiftCare operator).';

-- Integrity: roles must fit the scope they are assigned in.
create or replace function private.validate_role_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r public.roles;
begin
  select * into r from public.roles where id = new.role_id;

  if tg_table_name = 'employee_roles' then
    if r.scope <> 'hospital' or (r.hospital_id is not null and r.hospital_id <> new.hospital_id) then
      raise exception 'Role % cannot be assigned in hospital %', r.key, new.hospital_id using errcode = '23514';
    end if;
  elsif r.scope <> 'platform' then
    raise exception 'Role % is not a platform role', r.key using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger employee_roles_validate
  before insert or update of role_id, hospital_id on public.employee_roles
  for each row execute function private.validate_role_assignment();

create trigger platform_role_assignments_validate
  before insert or update of role_id on public.platform_role_assignments
  for each row execute function private.validate_role_assignment();

create or replace function private.validate_role_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select scope from public.roles where id = new.role_id)
     is distinct from (select scope from public.permissions where key = new.permission_key) then
    raise exception 'Permission % does not match the scope of the role', new.permission_key using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger role_permissions_validate
  before insert or update on public.role_permissions
  for each row execute function private.validate_role_permission();

-- =============================================================================
-- Permission catalogue & built-in roles
-- =============================================================================
insert into public.permissions (key, scope, category, description) values
  ('schedule.view',            'hospital', 'schedule',      'View own and published schedules'),
  ('schedule.view_drafts',     'hospital', 'schedule',      'View unpublished schedules in scope'),
  ('schedule.manage',          'hospital', 'schedule',      'Create and edit schedules and entries in scope'),
  ('schedule.publish',         'hospital', 'schedule',      'Publish schedules in scope'),
  ('team.view',                'hospital', 'team',          'See colleagues and who is on duty'),
  ('employees.view',           'hospital', 'employees',     'Open the employee overview incl. contact details'),
  ('employees.manage',         'hospital', 'employees',     'Create and edit employees and ward memberships'),
  ('roles.assign',             'hospital', 'administration','Assign roles to employees'),
  ('roles.manage',             'hospital', 'administration','Create and edit custom roles'),
  ('leave.request',            'hospital', 'leave',         'Request own leave'),
  ('leave.view',               'hospital', 'leave',         'View leave requests in scope'),
  ('leave.approve',            'hospital', 'leave',         'Approve or reject leave requests in scope'),
  ('sick_leave.report',        'hospital', 'sick_leave',    'Report own sick leave'),
  ('sick_leave.view',          'hospital', 'sick_leave',    'View sick leave periods in scope'),
  ('sick_leave.view_details',  'hospital', 'sick_leave',    'Read the (encrypted) comment of sick leave in scope'),
  ('announcements.publish',    'hospital', 'communication', 'Publish announcements in scope'),
  ('documents.view',           'hospital', 'documents',     'View shared hospital / ward documents'),
  ('documents.manage',         'hospital', 'documents',     'Upload and manage documents in scope'),
  ('qualifications.manage',    'hospital', 'employees',     'Maintain qualification catalogue and employee qualifications'),
  ('organization.manage',      'hospital', 'administration','Maintain departments, wards and shift types'),
  ('settings.manage',          'hospital', 'administration','Change hospital settings'),
  ('audit.view',               'hospital', 'administration','Read the audit log of the hospital'),
  ('platform.hospitals.manage','platform', 'platform',      'Create and manage hospitals (tenants)'),
  ('platform.audit.view',      'platform', 'platform',      'Read platform-wide audit logs');

insert into public.roles (key, name, description, scope, is_system, sort_order) values
  ('nurse',          'Nurse',                  'Pflegekraft',             'hospital', true, 10),
  ('charge_nurse',   'Charge Nurse',           'Stationsleitung',         'hospital', true, 20),
  ('head_nurse',     'Head Nurse',             'Pflegedienstleitung',     'hospital', true, 30),
  ('hr',             'HR',                     'Personalabteilung',       'hospital', true, 40),
  ('hospital_admin', 'Hospital Administrator', 'Krankenhaus-Administration','hospital', true, 50),
  ('system_admin',   'System Administrator',   'ShiftCare-Plattformbetrieb','platform', true, 60);

with matrix (role_key, permission_key) as (
  values
    -- Nurse: self-service
    ('nurse', 'schedule.view'), ('nurse', 'team.view'), ('nurse', 'leave.request'),
    ('nurse', 'sick_leave.report'), ('nurse', 'documents.view'),
    -- Charge nurse (Stationsleitung): self-service + ward management
    ('charge_nurse', 'schedule.view'), ('charge_nurse', 'team.view'), ('charge_nurse', 'leave.request'),
    ('charge_nurse', 'sick_leave.report'), ('charge_nurse', 'documents.view'),
    ('charge_nurse', 'schedule.view_drafts'), ('charge_nurse', 'schedule.manage'), ('charge_nurse', 'schedule.publish'),
    ('charge_nurse', 'employees.view'), ('charge_nurse', 'leave.view'), ('charge_nurse', 'leave.approve'),
    ('charge_nurse', 'sick_leave.view'), ('charge_nurse', 'sick_leave.view_details'),
    ('charge_nurse', 'announcements.publish'),
    -- Head nurse (Pflegedienstleitung): charge nurse across wards + qualifications/documents
    ('head_nurse', 'schedule.view'), ('head_nurse', 'team.view'), ('head_nurse', 'leave.request'),
    ('head_nurse', 'sick_leave.report'), ('head_nurse', 'documents.view'),
    ('head_nurse', 'schedule.view_drafts'), ('head_nurse', 'schedule.manage'), ('head_nurse', 'schedule.publish'),
    ('head_nurse', 'employees.view'), ('head_nurse', 'leave.view'), ('head_nurse', 'leave.approve'),
    ('head_nurse', 'sick_leave.view'), ('head_nurse', 'sick_leave.view_details'),
    ('head_nurse', 'announcements.publish'), ('head_nurse', 'documents.manage'), ('head_nurse', 'qualifications.manage'),
    -- HR: personnel administration, no clinical scheduling rights, no sick-leave comments
    ('hr', 'schedule.view'), ('hr', 'team.view'), ('hr', 'leave.request'), ('hr', 'sick_leave.report'),
    ('hr', 'documents.view'), ('hr', 'documents.manage'),
    ('hr', 'employees.view'), ('hr', 'employees.manage'), ('hr', 'roles.assign'),
    ('hr', 'leave.view'), ('hr', 'sick_leave.view'), ('hr', 'qualifications.manage'),
    -- Hospital admin: configuration of the tenant (least privilege: no sick-leave comments)
    ('hospital_admin', 'schedule.view'), ('hospital_admin', 'team.view'), ('hospital_admin', 'documents.view'),
    ('hospital_admin', 'documents.manage'), ('hospital_admin', 'employees.view'), ('hospital_admin', 'employees.manage'),
    ('hospital_admin', 'roles.assign'), ('hospital_admin', 'roles.manage'), ('hospital_admin', 'organization.manage'),
    ('hospital_admin', 'settings.manage'), ('hospital_admin', 'audit.view'), ('hospital_admin', 'announcements.publish'),
    ('hospital_admin', 'qualifications.manage'),
    -- System admin (platform operator)
    ('system_admin', 'platform.hospitals.manage'), ('system_admin', 'platform.audit.view')
)
insert into public.role_permissions (role_id, permission_key)
select r.id, m.permission_key
from matrix m
join public.roles r on r.key = m.role_key and r.hospital_id is null;

-- =============================================================================
-- Authorization helpers (used by RLS and RPCs)
--
-- All helpers are SECURITY DEFINER (they read RBAC tables regardless of the
-- caller's RLS), STABLE, and pinned to an empty search_path.
-- Policies call them as `col IN (SELECT private.fn(...))` so PostgreSQL
-- evaluates each helper ONCE per statement (InitPlan), not once per row.
-- =============================================================================

-- Active employments of the current user.
create or replace function private.my_employee_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.hospitals h on h.id = e.hospital_id and h.is_active
  where e.user_id = (select auth.uid())
    and e.status = 'active'
$$;

-- Hospitals the current user is actively employed in.
create or replace function private.my_hospital_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.hospital_id
  from public.employees e
  join public.hospitals h on h.id = e.hospital_id and h.is_active
  where e.user_id = (select auth.uid())
    and e.status = 'active'
$$;

-- Wards the current user belongs to.
create or replace function private.my_unit_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select eu.unit_id
  from public.employee_units eu
  where eu.employee_id in (select private.my_employee_ids())
$$;

-- Effective grants of the current user: one row per (permission, scope).
create or replace function private.my_grants()
returns table (hospital_id uuid, permission_key text, department_id uuid, unit_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select er.hospital_id, rp.permission_key, er.department_id, er.unit_id
  from public.employee_roles er
  join public.employees e        on e.id = er.employee_id
  join public.hospitals h        on h.id = er.hospital_id and h.is_active
  join public.role_permissions rp on rp.role_id = er.role_id
  where e.user_id = (select auth.uid())
    and e.status = 'active'
    and (er.valid_until is null or er.valid_until > now())
$$;

-- Hospitals in which the user holds `p` with hospital-wide scope.
create or replace function private.hospitals_with_permission(p text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct g.hospital_id
  from private.my_grants() g
  where g.permission_key = p
    and g.department_id is null
    and g.unit_id is null
$$;

-- Hospitals in which the user holds `p` with any scope.
create or replace function private.hospitals_with_any_permission(p text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct g.hospital_id
  from private.my_grants() g
  where g.permission_key = p
$$;

-- Wards covered by the user's grants of `p`.
create or replace function private.units_with_permission(p text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct u.id
  from private.my_grants() g
  join public.units u on u.hospital_id = g.hospital_id
  where g.permission_key = p
    and (   g.unit_id = u.id
         or g.department_id = u.department_id
         or (g.unit_id is null and g.department_id is null))
$$;

-- Employees covered by the user's grants of `p`
-- (members of covered wards + everybody for hospital-wide grants).
create or replace function private.employees_with_permission(p text)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select eu.employee_id
  from public.employee_units eu
  where eu.unit_id in (select private.units_with_permission(p))
  union
  select e.id
  from public.employees e
  where e.hospital_id in (select private.hospitals_with_permission(p))
$$;

create or replace function private.has_unit_permission(p text, p_unit_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_unit_id in (select private.units_with_permission(p))
$$;

create or replace function private.has_employee_permission(p text, p_employee_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_employee_id in (select private.employees_with_permission(p))
$$;

create or replace function private.has_platform_permission(p text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_role_assignments pa
    join public.role_permissions rp on rp.role_id = pa.role_id
    where pa.user_id = (select auth.uid())
      and rp.permission_key = p
  )
$$;

-- Recipients (user ids) holding `p` with a scope that covers an employee.
-- Used by notification triggers, e.g. "notify the ward managers".
create or replace function private.user_ids_with_permission_for_employee(p text, p_employee_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select distinct holder.user_id
  from public.employees target
  join public.employee_roles er   on er.hospital_id = target.hospital_id
  join public.role_permissions rp on rp.role_id = er.role_id and rp.permission_key = p
  join public.employees holder    on holder.id = er.employee_id and holder.status = 'active'
  where target.id = p_employee_id
    and (er.valid_until is null or er.valid_until > now())
    and (   (er.unit_id is null and er.department_id is null)
         or er.unit_id in (select eu.unit_id from public.employee_units eu where eu.employee_id = target.id)
         or er.department_id in (
              select u.department_id
              from public.employee_units eu
              join public.units u on u.id = eu.unit_id
              where eu.employee_id = target.id))
$$;

-- Lock helpers down: callable by signed-in users (needed inside RLS), never anon.
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
