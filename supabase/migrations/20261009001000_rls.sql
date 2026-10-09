-- =============================================================================
-- ShiftCare · 1000 · Row Level Security & privileges
--
-- Principles
--   1. Deny by default: RLS is enabled on EVERY table; anon has no access.
--   2. Tenant isolation: every policy is anchored on hospital_id / employee_id
--      sets derived from the caller's own active employments.
--   3. Least privilege: table privileges are narrowed to what the client
--      actually needs (column-level UPDATE/INSERT grants); workflow state
--      changes go through SECURITY DEFINER RPCs with explicit checks.
--   4. Performance: helpers are invoked as `IN (SELECT private.fn())`, which
--      PostgreSQL evaluates once per statement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privileges baseline (Supabase grants ALL on public tables by default)
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------
create policy languages_select on public.languages
  for select to authenticated using (true);

create policy permissions_select on public.permissions
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Hospitals
-- -----------------------------------------------------------------------------
grant update (name, timezone, default_locale) on public.hospitals to authenticated;

create policy hospitals_select on public.hospitals
  for select to authenticated
  using (
    id in (select private.my_hospital_ids())
    or (select private.has_platform_permission('platform.hospitals.manage'))
  );

create policy hospitals_update on public.hospitals
  for update to authenticated
  using (id in (select private.hospitals_with_permission('settings.manage')))
  with check (id in (select private.hospitals_with_permission('settings.manage')));

-- -----------------------------------------------------------------------------
-- Departments & units
-- -----------------------------------------------------------------------------
grant insert, update, delete on public.departments, public.units to authenticated;

create policy departments_select on public.departments
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy departments_write on public.departments
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('organization.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('organization.manage')));

create policy units_select on public.units
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy units_write on public.units
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('organization.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('organization.manage')));

-- -----------------------------------------------------------------------------
-- Users (personal profile)
-- Colleagues see only the safe subset exposed by public.employee_directory.
-- -----------------------------------------------------------------------------
grant update (first_name, last_name, avatar_path, phone, preferred_locale, theme) on public.users to authenticated;

create policy users_select on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select e.user_id from public.employees e
      where e.id in (select private.employees_with_permission('employees.view'))
    )
  );

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Employees & ward memberships
-- -----------------------------------------------------------------------------
grant insert, delete on public.employees to authenticated;
grant update (personnel_number, job_title, employment_type, weekly_hours, status, hire_date) on public.employees to authenticated;
grant insert, update, delete on public.employee_units to authenticated;

create policy employees_select on public.employees
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or id in (select private.employees_with_permission('employees.view'))
    or hospital_id in (select private.hospitals_with_permission('employees.manage'))
  );

create policy employees_write on public.employees
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('employees.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('employees.manage')));

create policy employee_units_select on public.employee_units
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy employee_units_write on public.employee_units
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('employees.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('employees.manage')));

-- -----------------------------------------------------------------------------
-- Spoken languages
-- -----------------------------------------------------------------------------
grant insert, update, delete on public.user_languages to authenticated;

create policy user_languages_select on public.user_languages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (
      select e.user_id from public.employees e
      where e.hospital_id in (select private.hospitals_with_any_permission('team.view'))
    )
  );

create policy user_languages_write_self on public.user_languages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Qualifications
-- -----------------------------------------------------------------------------
grant insert, update, delete on public.qualifications, public.employee_qualifications to authenticated;

create policy qualifications_select on public.qualifications
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy qualifications_write on public.qualifications
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('qualifications.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('qualifications.manage')));

create policy employee_qualifications_select on public.employee_qualifications
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy employee_qualifications_write on public.employee_qualifications
  for all to authenticated
  using (employee_id in (select private.employees_with_permission('qualifications.manage')))
  with check (employee_id in (select private.employees_with_permission('qualifications.manage')));

-- -----------------------------------------------------------------------------
-- RBAC
-- -----------------------------------------------------------------------------

-- A user may only hand out roles whose permissions they hold themselves
-- (hospital-wide). Prevents privilege escalation via roles.assign.
create or replace function private.can_grant_role(p_role_id uuid, p_hospital_id uuid)
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

grant execute on function private.can_grant_role(uuid, uuid) to authenticated;

grant insert, update, delete on public.roles, public.role_permissions, public.employee_roles to authenticated;

create policy roles_select on public.roles
  for select to authenticated
  using (
    (hospital_id is null and scope = 'hospital')
    or hospital_id in (select private.my_hospital_ids())
    or (select private.has_platform_permission('platform.hospitals.manage'))
  );

create policy roles_write on public.roles
  for all to authenticated
  using (not is_system and hospital_id in (select private.hospitals_with_permission('roles.manage')))
  with check (not is_system and hospital_id in (select private.hospitals_with_permission('roles.manage')));

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (role_id in (select r.id from public.roles r));

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (role_id in (
    select r.id from public.roles r
    where not r.is_system and r.hospital_id in (select private.hospitals_with_permission('roles.manage'))))
  with check (
    role_id in (
      select r.id from public.roles r
      where not r.is_system
        and r.hospital_id in (select private.hospitals_with_permission('roles.manage'))
        -- cannot put a permission into a role that you do not hold yourself
        and permission_key in (
          select g.permission_key from private.my_grants() g
          where g.hospital_id = r.hospital_id and g.department_id is null and g.unit_id is null)));

create policy employee_roles_select on public.employee_roles
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or hospital_id in (select private.hospitals_with_any_permission('roles.assign'))
    or employee_id in (select private.employees_with_permission('employees.view'))
  );

create policy employee_roles_write on public.employee_roles
  for all to authenticated
  using (
    hospital_id in (select private.hospitals_with_permission('roles.assign'))
    and private.can_grant_role(role_id, hospital_id)
  )
  with check (
    hospital_id in (select private.hospitals_with_permission('roles.assign'))
    and private.can_grant_role(role_id, hospital_id)
  );

create policy platform_role_assignments_select on public.platform_role_assignments
  for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Scheduling
-- -----------------------------------------------------------------------------
grant insert, update, delete on public.shift_types to authenticated;
grant insert (hospital_id, unit_id, period_start, period_end) on public.schedules to authenticated;
grant update (period_start, period_end) on public.schedules to authenticated;
grant delete on public.schedules to authenticated;
grant insert (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date, starts_at, ends_at, note)
  on public.schedule_entries to authenticated;
grant update (employee_id, kind, shift_type_id, entry_date, starts_at, ends_at, note)
  on public.schedule_entries to authenticated;
grant delete on public.schedule_entries to authenticated;

create policy shift_types_select on public.shift_types
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy shift_types_write on public.shift_types
  for all to authenticated
  using (hospital_id in (select private.hospitals_with_permission('organization.manage')))
  with check (hospital_id in (select private.hospitals_with_permission('organization.manage')));

create policy schedules_select on public.schedules
  for select to authenticated
  using (
    (status = 'published' and hospital_id in (select private.hospitals_with_any_permission('schedule.view')))
    or unit_id in (select private.units_with_permission('schedule.view_drafts'))
  );

create policy schedules_insert on public.schedules
  for insert to authenticated
  with check (status = 'draft' and unit_id in (select private.units_with_permission('schedule.manage')));

create policy schedules_update on public.schedules
  for update to authenticated
  using (status <> 'archived' and unit_id in (select private.units_with_permission('schedule.manage')))
  with check (unit_id in (select private.units_with_permission('schedule.manage')));

create policy schedules_delete on public.schedules
  for delete to authenticated
  using (status = 'draft' and unit_id in (select private.units_with_permission('schedule.manage')));

create policy schedule_entries_select on public.schedule_entries
  for select to authenticated
  using (schedule_id in (select s.id from public.schedules s));   -- inherits schedules RLS

create policy schedule_entries_write on public.schedule_entries
  for all to authenticated
  using (schedule_id in (
    select s.id from public.schedules s
    where s.status <> 'archived' and s.unit_id in (select private.units_with_permission('schedule.manage'))))
  with check (schedule_id in (
    select s.id from public.schedules s
    where s.status <> 'archived' and s.unit_id in (select private.units_with_permission('schedule.manage'))));

-- -----------------------------------------------------------------------------
-- Absences
-- -----------------------------------------------------------------------------
grant insert (employee_id, leave_type, start_date, end_date, comment) on public.leave_requests to authenticated;

create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or employee_id in (select private.employees_with_permission('leave.view'))
    or employee_id in (select private.employees_with_permission('leave.approve'))
  );

create policy leave_requests_insert_own on public.leave_requests
  for insert to authenticated
  with check (
    employee_id in (select private.my_employee_ids())
    and hospital_id in (select private.hospitals_with_any_permission('leave.request'))
  );

-- Encrypted comment column is not selectable at all; use get_sick_leave_comment().
revoke select on public.sick_leaves from authenticated;
grant select (id, hospital_id, employee_id, start_date, end_date, status, certificate_document_id,
              reported_by, acknowledged_by, acknowledged_at, created_at, updated_at)
  on public.sick_leaves to authenticated;

create policy sick_leaves_select on public.sick_leaves
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or employee_id in (select private.employees_with_permission('sick_leave.view'))
  );

-- -----------------------------------------------------------------------------
-- Notifications & devices
-- -----------------------------------------------------------------------------
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant delete on public.device_tokens to authenticated;
grant update (device_name, app_version, last_seen_at) on public.device_tokens to authenticated;
revoke all on public.notification_deliveries from authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (recipient_id = (select auth.uid()));

create policy device_tokens_own on public.device_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
grant insert (hospital_id, unit_id, title, body, priority, published_at, expires_at) on public.announcements to authenticated;
grant update (title, body, priority, published_at, expires_at) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;

create or replace function private.can_publish_announcement(p_hospital_id uuid, p_unit_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_unit_id is null then p_hospital_id in (select private.hospitals_with_permission('announcements.publish'))
    else p_unit_id in (select private.units_with_permission('announcements.publish'))
  end
$$;

grant execute on function private.can_publish_announcement(uuid, uuid) to authenticated;

create policy announcements_select on public.announcements
  for select to authenticated
  using (
    (
      hospital_id in (select private.my_hospital_ids())
      and published_at <= now()
      and (expires_at is null or expires_at > now())
      and (unit_id is null or unit_id in (select private.my_unit_ids()))
    )
    or private.can_publish_announcement(hospital_id, unit_id)
  );

create policy announcements_write on public.announcements
  for all to authenticated
  using (private.can_publish_announcement(hospital_id, unit_id))
  with check (private.can_publish_announcement(hospital_id, unit_id));

-- -----------------------------------------------------------------------------
-- Documents
-- -----------------------------------------------------------------------------
grant insert (hospital_id, employee_id, unit_id, category, title, file_name, mime_type, size_bytes, visibility)
  on public.documents to authenticated;
grant update (category, title, visibility, unit_id) on public.documents to authenticated;
grant delete on public.documents to authenticated;

create or replace function private.can_manage_document(p_hospital_id uuid, p_employee_id uuid, p_unit_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    (p_employee_id is not null and p_employee_id in (select private.employees_with_permission('documents.manage')))
    or (p_employee_id is null and p_unit_id is not null and p_unit_id in (select private.units_with_permission('documents.manage')))
    or (p_employee_id is null and p_hospital_id in (select private.hospitals_with_permission('documents.manage')))
$$;

grant execute on function private.can_manage_document(uuid, uuid, uuid) to authenticated;

create policy documents_select on public.documents
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or (visibility = 'hospital' and hospital_id in (select private.hospitals_with_any_permission('documents.view')))
    or (visibility = 'unit' and hospital_id in (select private.hospitals_with_any_permission('documents.view'))
        and unit_id in (select private.my_unit_ids()))
    or private.can_manage_document(hospital_id, employee_id, unit_id)
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    (employee_id in (select private.my_employee_ids()) and visibility = 'private')
    or private.can_manage_document(hospital_id, employee_id, unit_id)
  );

create policy documents_update on public.documents
  for update to authenticated
  using (private.can_manage_document(hospital_id, employee_id, unit_id))
  with check (private.can_manage_document(hospital_id, employee_id, unit_id));

create policy documents_delete on public.documents
  for delete to authenticated
  using (
    (employee_id in (select private.my_employee_ids()) and uploaded_by = (select auth.uid()))
    or private.can_manage_document(hospital_id, employee_id, unit_id)
  );

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
grant insert (hospital_id, user_id, key, value), update (value), delete on public.settings to authenticated;

create policy settings_select on public.settings
  for select to authenticated
  using (
    (user_id is null and hospital_id in (select private.my_hospital_ids()))
    or user_id = (select auth.uid())
  );

create policy settings_write on public.settings
  for all to authenticated
  using (
    (user_id = (select auth.uid()) and hospital_id in (select private.my_hospital_ids()))
    or (user_id is null and hospital_id in (select private.hospitals_with_permission('settings.manage')))
  )
  with check (
    (user_id = (select auth.uid()) and hospital_id in (select private.my_hospital_ids()))
    or (user_id is null and hospital_id in (select private.hospitals_with_permission('settings.manage')))
  );

-- -----------------------------------------------------------------------------
-- Audit log (read-only)
-- -----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    hospital_id in (select private.hospitals_with_permission('audit.view'))
    or (select private.has_platform_permission('platform.audit.view'))
  );

-- -----------------------------------------------------------------------------
-- Storage (storage.objects already has RLS enabled by Supabase)
-- -----------------------------------------------------------------------------

-- Security INVOKER on purpose: visibility is decided by the documents RLS above.
create or replace function private.document_path_visible(p_name text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.documents d where d.storage_path = p_name)
$$;

create or replace function private.document_path_uploadable(p_name text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name
      and d.uploaded_by = (select auth.uid())
      and d.created_at > now() - interval '1 hour'
  )
$$;

create or replace function private.document_path_deletable(p_name text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name
      and (d.uploaded_by = (select auth.uid()) or private.can_manage_document(d.hospital_id, d.employee_id, d.unit_id))
  )
$$;

-- Users sharing at least one hospital with the caller (for avatars).
create or replace function private.colleague_user_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.user_id from public.employees e
  where e.hospital_id in (select private.my_hospital_ids()) and e.status = 'active'
$$;

grant execute on function
  private.document_path_visible(text),
  private.document_path_uploadable(text),
  private.document_path_deletable(text),
  private.colleague_user_ids()
to authenticated;

create policy documents_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.document_path_visible(name));

create policy documents_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.document_path_uploadable(name));

create policy documents_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and private.document_path_deletable(name));

create policy avatars_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] in (select u::text from private.colleague_user_ids() u
                                          union all select (select auth.uid())::text)
  );

create policy avatars_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
