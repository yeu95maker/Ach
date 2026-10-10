-- =============================================================================
-- Admin area: role assignment rule, employees overview, organisation
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set hanna '00000000-0000-4000-a000-000000000006'
\set admin '00000000-0000-4000-a000-000000000007'

-- Krankenhaus-Administration
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  list jsonb;
  dept uuid;
  unit uuid;
begin
  list := public.admin_employees('10000000-0000-4000-a000-000000000001');
  assert jsonb_array_length(list) = 7, 'all employees of the hospital';
  assert exists (select 1 from jsonb_array_elements(list) x where x ->> 'email' = 'anna.becker@shiftcare.dev'
                 and jsonb_array_length(x -> 'roles') = 1), 'with roles';

  assert exists (select 1 from public.assignable_roles('10000000-0000-4000-a000-000000000001') where role_key = 'nurse'),
    'admin can hand out the nurse role';
  assert exists (select 1 from public.assignable_roles('10000000-0000-4000-a000-000000000001') where role_key = 'head_nurse'),
    'and the Stationsleitung role';

  -- Anna becomes deputy head of 3A
  insert into public.employee_roles (hospital_id, employee_id, role_id, unit_id)
  select '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', id, '30000000-0000-4000-a000-000000000001'
  from public.roles where key = 'deputy_head_nurse' and hospital_id is null;

  -- no self-escalation into clinical lead roles
  begin
    insert into public.employee_roles (hospital_id, employee_id, role_id)
    select '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000007', id
    from public.roles where key = 'head_nurse' and hospital_id is null;
    raise exception 'admin must not give himself head_nurse';
  exception when insufficient_privilege then null;
  end;

  -- cannot lock himself out
  begin
    update public.employees set status = 'inactive' where id = '40000000-0000-4000-a000-000000000007';
    raise exception 'self deactivation must fail';
  exception when invalid_parameter_value then null;
  end;

  -- deactivate / reactivate somebody else
  update public.employees set status = 'inactive' where id = '40000000-0000-4000-a000-000000000003';
  assert (select status from public.employees where id = '40000000-0000-4000-a000-000000000003') = 'inactive', 'deactivated';

  -- organisation: new department, ward and shift type
  insert into public.departments (hospital_id, name, code) values ('10000000-0000-4000-a000-000000000001', 'Geriatrie', 'GER')
  returning id into dept;
  insert into public.units (hospital_id, department_id, name, code) values ('10000000-0000-4000-a000-000000000001', dept, 'Station 5 · Geriatrie', '5G')
  returning id into unit;
  insert into public.shift_types (hospital_id, unit_id, code, name, category, start_time, end_time, break_minutes)
  values ('10000000-0000-4000-a000-000000000001', unit, 'Z', 'Zwischendienst', 'day', '10:00', '18:30', 30);

  -- foreign hospital untouchable
  begin
    insert into public.units (hospital_id, department_id, name) values ('10000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000003', 'x');
    raise exception 'foreign hospital must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- HR can now hand out the nurse role (previously impossible: HR lacks wishes.submit)
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'hanna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into public.employee_roles (hospital_id, employee_id, role_id, unit_id)
  select '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', id, '30000000-0000-4000-a000-000000000002'
  from public.roles where key = 'nurse' and hospital_id is null;
  assert not exists (select 1 from public.assignable_roles('10000000-0000-4000-a000-000000000001') where role_key = 'hospital_admin'),
    'HR cannot hand out the admin role';
end $$;
rollback;

-- A nurse has no access to the admin overview
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.admin_employees('10000000-0000-4000-a000-000000000001');
  raise exception 'nurse must not open the admin overview';
exception when insufficient_privilege then null;
end $$;
rollback;

\o
\echo '  ✓ Admin assertions passed'
