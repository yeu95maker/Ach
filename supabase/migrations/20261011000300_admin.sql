-- =============================================================================
-- ShiftCare · Admin area (Mitarbeitende, Stationen, Schichtarten, Rollen)
--
-- Role assignment rule (replaces the strict "subset of own permissions" rule,
-- which made it impossible for HR / hospital admins to hand out even the
-- nurse role, because they do not hold clinical self-service permissions):
--
--   * administrative permissions (categories 'administration' and 'employees')
--     can only be passed on by someone who holds them hospital-wide;
--   * nobody can give themselves a role unless they already hold every
--     permission of that role (no self-escalation).
-- =============================================================================

create or replace function private.can_grant_role(p_role_id uuid, p_hospital_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not exists (
    select rp.permission_key
    from public.role_permissions rp
    join public.permissions p on p.key = rp.permission_key
    where rp.role_id = p_role_id and p.category in ('administration', 'employees')
    except
    select g.permission_key from private.my_grants() g
    where g.hospital_id = p_hospital_id and g.department_id is null and g.unit_id is null
  )
$$;

create or replace function private.holds_all_role_permissions(p_role_id uuid, p_hospital_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not exists (
    select rp.permission_key from public.role_permissions rp where rp.role_id = p_role_id
    except
    select g.permission_key from private.my_grants() g
    where g.hospital_id = p_hospital_id and g.department_id is null and g.unit_id is null
  )
$$;

revoke execute on function private.holds_all_role_permissions(uuid, uuid) from public, anon;
grant execute on function private.holds_all_role_permissions(uuid, uuid) to authenticated;

drop policy employee_roles_write on public.employee_roles;
create policy employee_roles_write on public.employee_roles
  for all to authenticated
  using (
    hospital_id in (select private.hospitals_with_permission('roles.assign'))
    and private.can_grant_role(role_id, hospital_id)
    and (employee_id not in (select private.my_employee_ids()) or private.holds_all_role_permissions(role_id, hospital_id))
  )
  with check (
    hospital_id in (select private.hospitals_with_permission('roles.assign'))
    and private.can_grant_role(role_id, hospital_id)
    and (employee_id not in (select private.my_employee_ids()) or private.holds_all_role_permissions(role_id, hospital_id))
  );

-- Admins never lock themselves out: no deactivating your own employment.
create or replace function private.employee_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'inactive' and old.status = 'active' and new.user_id = (select auth.uid()) then
    raise exception 'You cannot deactivate yourself' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger employees_before_update
  before update of status on public.employees
  for each row execute function private.employee_before_update();

-- -----------------------------------------------------------------------------
-- Employee overview for the admin area (one round trip).
-- -----------------------------------------------------------------------------
create or replace function public.admin_employees(p_hospital_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_hospital_id not in (select private.hospitals_with_permission('employees.manage'))
     and p_hospital_id not in (select private.hospitals_with_permission('roles.assign')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employee_id',      e.id,
      'user_id',          e.user_id,
      'first_name',       u.first_name,
      'last_name',        u.last_name,
      'email',            u.email,
      'phone',            u.phone,
      'avatar_path',      u.avatar_path,
      'personnel_number', e.personnel_number,
      'job_title',        e.job_title,
      'employment_type',  e.employment_type,
      'weekly_hours',     e.weekly_hours,
      'status',           e.status,
      'hire_date',        e.hire_date,
      'units', coalesce((
        select jsonb_agg(jsonb_build_object('id', un.id, 'name', un.name, 'is_primary', eu.is_primary) order by eu.is_primary desc, un.name)
        from public.employee_units eu join public.units un on un.id = eu.unit_id
        where eu.employee_id = e.id), '[]'::jsonb),
      'roles', coalesce((
        select jsonb_agg(jsonb_build_object(
          'assignment_id', er.id, 'role_id', r.id, 'role_key', r.key, 'role_name', r.name,
          'unit_id', er.unit_id, 'unit_name', un.name, 'department_id', er.department_id, 'department_name', d.name)
          order by r.sort_order)
        from public.employee_roles er
        join public.roles r on r.id = er.role_id
        left join public.units un on un.id = er.unit_id
        left join public.departments d on d.id = er.department_id
        where er.employee_id = e.id and (er.valid_until is null or er.valid_until > now())), '[]'::jsonb)
    ) order by e.status, u.last_name, u.first_name)
    from public.employees e
    join public.users u on u.id = e.user_id
    where e.hospital_id = p_hospital_id
  ), '[]'::jsonb);
end;
$$;

-- Roles the caller may hand out in a hospital (UI hint; RLS enforces the same).
create or replace function public.assignable_roles(p_hospital_id uuid)
returns table (role_id uuid, role_key text, role_name text, description text)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.key, r.name, r.description
  from public.roles r
  where r.scope = 'hospital'
    and (r.hospital_id is null or r.hospital_id = p_hospital_id)
    and p_hospital_id in (select private.hospitals_with_permission('roles.assign'))
    and private.can_grant_role(r.id, p_hospital_id)
  order by r.sort_order, r.name
$$;

revoke execute on function public.admin_employees(uuid), public.assignable_roles(uuid) from public, anon;
grant execute on function public.admin_employees(uuid), public.assignable_roles(uuid) to authenticated;
