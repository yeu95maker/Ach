-- =============================================================================
-- ShiftCare · 1100 · API layer: views, encryption and workflow RPCs
--
-- Reads   → tables / views protected by RLS (PostgREST).
-- Writes  → simple self-service inserts directly; every workflow state change
--           through the functions below. SECURITY DEFINER functions always
--           (1) check the caller's permission explicitly, (2) pin search_path,
--           (3) only touch the rows they were asked to change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Column encryption (pgcrypto + Supabase Vault)
-- The key is generated inside the database on first migration and never
-- leaves Vault. Rotate with private.rotate_data_key() (see docs/SECURITY.md).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'shiftcare_data_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'shiftcare_data_key',
      'Symmetric key for column-level encryption of sensitive data (ShiftCare)');
  end if;
end;
$$;

create or replace function private.data_key()
returns text
language sql stable security definer
set search_path = ''
as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'shiftcare_data_key'
$$;

create or replace function private.encrypt_text(p_value text)
returns bytea
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return extensions.pgp_sym_encrypt(p_value, private.data_key(), 'cipher-algo=aes256');
end;
$$;

create or replace function private.decrypt_text(p_value bytea)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case when p_value is null then null else extensions.pgp_sym_decrypt(p_value, private.data_key()) end
$$;

-- Key material is reachable only from SECURITY DEFINER code owned by postgres.
revoke execute on function private.data_key(), private.encrypt_text(text), private.decrypt_text(bytea)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Server-maintained columns
-- -----------------------------------------------------------------------------
create or replace function private.schedule_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  return new;
end;
$$;

create trigger schedules_before_insert
  before insert on public.schedules
  for each row execute function private.schedule_before_insert();

create or replace function private.announcement_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce((select auth.uid()), new.author_id);
  end if;
  return new;
end;
$$;

create trigger announcements_before_write
  before insert on public.announcements
  for each row execute function private.announcement_before_write();

-- =============================================================================
-- Views
-- =============================================================================

-- Colleague directory: the SAFE public subset of employee + profile data that
-- every member of the same hospital (with team.view) may see.
-- Runs with owner rights (bypasses table RLS) and filters by tenant itself.
create or replace view public.employee_directory
with (security_barrier = true)
as
select
  e.id            as employee_id,
  e.hospital_id,
  e.user_id,
  u.first_name,
  u.last_name,
  u.avatar_path,
  e.job_title,
  pu.unit_id      as primary_unit_id,
  un.name         as primary_unit_name,
  coalesce((
    select array_agg(ul.language_code order by ul.language_code)
    from public.user_languages ul where ul.user_id = u.id
  ), '{}'::text[]) as languages,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'name', q.name) order by q.name)
    from public.employee_qualifications eq
    join public.qualifications q on q.id = eq.qualification_id
    where eq.employee_id = e.id
      and (eq.valid_until is null or eq.valid_until >= current_date)
  ), '[]'::jsonb) as qualifications
from public.employees e
join public.users u on u.id = e.user_id
left join public.employee_units pu on pu.employee_id = e.id and pu.is_primary
left join public.units un on un.id = pu.unit_id
where e.status = 'active'
  and e.hospital_id in (select private.hospitals_with_any_permission('team.view'));

comment on view public.employee_directory is
  'Colleague directory (name, picture, profession, ward, qualifications, languages). Tenant-filtered.';

-- Shifts with colleague info. SECURITY INVOKER: schedule_entries RLS applies,
-- so only published (or manageable) rosters are visible.
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
  d.qualifications
from public.schedule_entries se
join public.schedules s       on s.id = se.schedule_id
join public.units un          on un.id = s.unit_id
left join public.shift_types st on st.id = se.shift_type_id
left join public.employee_directory d on d.employee_id = se.employee_id;

grant select on public.employee_directory, public.shift_roster to authenticated;

-- =============================================================================
-- RPC: session context (one round trip at app start)
-- =============================================================================
create or replace function public.my_context()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user', (
      select to_jsonb(u) - 'created_at' - 'updated_at'
      from public.users u where u.id = (select auth.uid())
    ),
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object('code', ul.language_code, 'proficiency', ul.proficiency) order by ul.language_code)
      from public.user_languages ul where ul.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'employments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id,
        'job_title',   e.job_title,
        'hospital',    jsonb_build_object('id', h.id, 'name', h.name, 'timezone', h.timezone, 'default_locale', h.default_locale),
        'units', coalesce((
          select jsonb_agg(jsonb_build_object('id', un.id, 'name', un.name, 'is_primary', eu.is_primary) order by eu.is_primary desc, un.name)
          from public.employee_units eu join public.units un on un.id = eu.unit_id
          where eu.employee_id = e.id
        ), '[]'::jsonb),
        'roles', coalesce((
          select jsonb_agg(distinct r.key)
          from public.employee_roles er join public.roles r on r.id = er.role_id
          where er.employee_id = e.id and (er.valid_until is null or er.valid_until > now())
        ), '[]'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(distinct g.permission_key)
          from private.my_grants() g where g.hospital_id = e.hospital_id
        ), '[]'::jsonb),
        'managed_unit_ids', coalesce((
          select jsonb_agg(distinct u2)
          from private.units_with_permission('schedule.manage') u2
          join public.units x on x.id = u2 and x.hospital_id = e.hospital_id
        ), '[]'::jsonb)
      ) order by h.name)
      from public.employees e
      join public.hospitals h on h.id = e.hospital_id and h.is_active
      where e.user_id = (select auth.uid()) and e.status = 'active'
    ), '[]'::jsonb),
    'platform_permissions', coalesce((
      select jsonb_agg(distinct rp.permission_key)
      from public.platform_role_assignments pa
      join public.role_permissions rp on rp.role_id = pa.role_id
      where pa.user_id = (select auth.uid())
    ), '[]'::jsonb)
  )
$$;

-- =============================================================================
-- RPC: dashboard summary (one round trip, RLS applies – SECURITY INVOKER)
-- =============================================================================
create or replace function public.get_dashboard(p_employee_id uuid)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_hospital uuid;
  v_tz       text;
  v_today    date;
  v_now      timestamptz := now();
begin
  select e.hospital_id, h.timezone into v_hospital, v_tz
  from public.employees e join public.hospitals h on h.id = e.hospital_id
  where e.id = p_employee_id and e.user_id = (select auth.uid());

  if v_hospital is null then
    raise exception 'Unknown employment' using errcode = '42501';
  end if;

  v_today := (v_now at time zone v_tz)::date;

  return jsonb_build_object(
    'today', v_today,
    'today_entries', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.starts_at nulls first)
      from public.shift_roster r
      where r.employee_id = p_employee_id and r.entry_date = v_today and r.schedule_status = 'published'
    ), '[]'::jsonb),
    'next_shift', (
      select to_jsonb(r)
      from public.shift_roster r
      where r.employee_id = p_employee_id and r.kind = 'shift' and r.schedule_status = 'published'
        and r.starts_at > v_now and r.entry_date > v_today
      order by r.starts_at
      limit 1
    ),
    'absence_today', (
      select jsonb_build_object('type', a.type, 'start_date', a.start_date, 'end_date', a.end_date)
      from (
        select 'vacation' as type, lr.start_date, lr.end_date from public.leave_requests lr
        where lr.employee_id = p_employee_id and lr.status = 'approved' and v_today between lr.start_date and lr.end_date
        union all
        select 'sick', sl.start_date, sl.end_date from public.sick_leaves sl
        where sl.employee_id = p_employee_id and sl.status in ('reported', 'acknowledged') and v_today between sl.start_date and sl.end_date
      ) a
      limit 1
    ),
    'unread_notifications', (
      select count(*) from public.notifications n
      where n.recipient_id = (select auth.uid()) and n.read_at is null
    ),
    'recent_notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (
        select id, type, payload, read_at, created_at from public.notifications
        where recipient_id = (select auth.uid())
        order by created_at desc limit 3
      ) n
    ), '[]'::jsonb),
    'my_open_requests', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.start_date)
      from (
        select id, leave_type, start_date, end_date, status, created_at from public.leave_requests
        where employee_id = p_employee_id and (status = 'pending' or (status in ('approved', 'rejected') and end_date >= v_today))
        order by start_date limit 5
      ) lr
    ), '[]'::jsonb),
    'open_shifts', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.starts_at)
      from (
        select entry_id, unit_id, unit_name, entry_date, starts_at, ends_at, shift_code, shift_name, shift_category
        from public.shift_roster
        where employee_id is null and schedule_status = 'published'
          and hospital_id = v_hospital
          and unit_id in (select eu.unit_id from public.employee_units eu where eu.employee_id = p_employee_id)
          and starts_at > v_now and entry_date <= v_today + 14
        order by starts_at limit 5
      ) r
    ), '[]'::jsonb),
    'pending_approvals', (
      select count(*) from public.leave_requests lr
      where lr.status = 'pending' and lr.hospital_id = v_hospital
        and lr.employee_id <> p_employee_id
        and lr.employee_id in (select private.employees_with_permission('leave.approve'))
    ),
    'unacknowledged_sick_leaves', (
      select count(*) from public.sick_leaves sl
      where sl.status = 'reported' and sl.hospital_id = v_hospital
        and sl.employee_id <> p_employee_id
        and sl.employee_id in (select private.employees_with_permission('sick_leave.view'))
    ),
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.published_at desc)
      from (
        select id, title, body, priority, published_at from public.announcements
        where hospital_id = v_hospital and published_at <= v_now
          and (expires_at is null or expires_at > v_now)
          and (unit_id is null or unit_id in (select eu.unit_id from public.employee_units eu where eu.employee_id = p_employee_id))
        order by priority desc, published_at desc limit 3
      ) a
    ), '[]'::jsonb)
  );
end;
$$;

-- =============================================================================
-- RPC: schedules
-- =============================================================================
create or replace function public.publish_schedule(p_schedule_id uuid)
returns public.schedules
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  s public.schedules;
begin
  select * into s from public.schedules where id = p_schedule_id for update;

  if s.id is null or not private.has_unit_permission('schedule.publish', s.unit_id) then
    raise exception 'Not allowed to publish this schedule' using errcode = '42501';
  end if;
  if s.status = 'archived' then
    raise exception 'Archived schedules cannot be published' using errcode = '22023';
  end if;

  update public.schedules
     set status = 'published',
         version = version + 1,
         published_at = now(),
         published_by = (select auth.uid())
   where id = p_schedule_id
  returning * into s;

  return s;
end;
$$;

-- =============================================================================
-- RPC: leave requests
-- =============================================================================
create or replace function public.decide_leave_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.leave_requests
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  lr public.leave_requests;
begin
  select * into lr from public.leave_requests where id = p_request_id for update;

  if lr.id is null or not private.has_employee_permission('leave.approve', lr.employee_id) then
    raise exception 'Not allowed to decide this request' using errcode = '42501';
  end if;
  if lr.employee_id in (select private.my_employee_ids()) then
    raise exception 'Own requests cannot be decided by yourself' using errcode = '42501';
  end if;
  if lr.status <> 'pending' then
    raise exception 'Request is no longer pending' using errcode = '22023';
  end if;

  update public.leave_requests
     set status        = case when p_approve then 'approved' else 'rejected' end::public.request_status,
         decided_by    = (select auth.uid()),
         decided_at    = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_request_id
  returning * into lr;

  return lr;
end;
$$;

create or replace function public.cancel_leave_request(p_request_id uuid)
returns public.leave_requests
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  lr public.leave_requests;
begin
  select * into lr from public.leave_requests where id = p_request_id for update;

  if lr.id is null or lr.employee_id not in (select private.my_employee_ids()) then
    raise exception 'Not allowed to cancel this request' using errcode = '42501';
  end if;
  if lr.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled' using errcode = '22023';
  end if;

  update public.leave_requests set status = 'cancelled' where id = p_request_id returning * into lr;
  return lr;
end;
$$;

-- =============================================================================
-- RPC: sick leave
-- =============================================================================
create or replace function public.report_sick_leave(
  p_employee_id uuid,
  p_start_date  date,
  p_end_date    date,
  p_comment     text default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_hospital uuid;
  v_id       uuid;
begin
  select e.hospital_id into v_hospital
  from public.employees e
  where e.id = p_employee_id and e.id in (select private.my_employee_ids());

  if v_hospital is null or v_hospital not in (select private.hospitals_with_any_permission('sick_leave.report')) then
    raise exception 'Not allowed to report sick leave' using errcode = '42501';
  end if;
  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'Comment too long' using errcode = '22001';
  end if;
  if p_start_date < current_date - 30 then
    raise exception 'Sick leave cannot start more than 30 days in the past' using errcode = '22023';
  end if;

  insert into public.sick_leaves (hospital_id, employee_id, start_date, end_date, comment_encrypted, reported_by)
  values (v_hospital, p_employee_id, p_start_date, p_end_date, private.encrypt_text(p_comment), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.acknowledge_sick_leave(p_sick_leave_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  sl public.sick_leaves;
begin
  select * into sl from public.sick_leaves where id = p_sick_leave_id for update;

  if sl.id is null or not private.has_employee_permission('sick_leave.view', sl.employee_id)
     or sl.employee_id in (select private.my_employee_ids()) then
    raise exception 'Not allowed to acknowledge this sick leave' using errcode = '42501';
  end if;
  if sl.status <> 'reported' then
    raise exception 'Sick leave was already processed' using errcode = '22023';
  end if;

  update public.sick_leaves
     set status = 'acknowledged', acknowledged_by = (select auth.uid()), acknowledged_at = now()
   where id = p_sick_leave_id;
end;
$$;

create or replace function public.get_sick_leave_comment(p_sick_leave_id uuid)
returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  sl public.sick_leaves;
begin
  select * into sl from public.sick_leaves where id = p_sick_leave_id;

  if sl.id is null
     or not (sl.employee_id in (select private.my_employee_ids())
             or private.has_employee_permission('sick_leave.view_details', sl.employee_id)) then
    raise exception 'Not allowed to read this sick leave' using errcode = '42501';
  end if;

  return private.decrypt_text(sl.comment_encrypted);
end;
$$;

-- =============================================================================
-- RPC: notifications & devices
-- =============================================================================
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language sql volatile
set search_path = ''
as $$
  with updated as (
    update public.notifications
       set read_at = now()
     where recipient_id = (select auth.uid())
       and read_at is null
       and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from updated
$$;

-- Tokens are globally unique: a device that switches accounts is re-assigned.
create or replace function public.register_device_token(
  p_platform      public.device_platform,
  p_token         text,
  p_web_push_keys jsonb default null,
  p_device_name   text default null,
  p_app_version   text default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.device_tokens (user_id, platform, token, web_push_keys, device_name, app_version, last_seen_at)
  values ((select auth.uid()), p_platform, p_token, p_web_push_keys, p_device_name, p_app_version, now())
  on conflict (token) do update
     set user_id = excluded.user_id,
         platform = excluded.platform,
         web_push_keys = excluded.web_push_keys,
         device_name = excluded.device_name,
         app_version = excluded.app_version,
         last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: authenticated only.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.my_context(),
  public.get_dashboard(uuid),
  public.publish_schedule(uuid),
  public.decide_leave_request(uuid, boolean, text),
  public.cancel_leave_request(uuid),
  public.report_sick_leave(uuid, date, date, text),
  public.acknowledge_sick_leave(uuid),
  public.get_sick_leave_comment(uuid),
  public.mark_notifications_read(uuid[]),
  public.register_device_token(public.device_platform, text, jsonb, text, text)
from public, anon;

grant execute on function
  public.my_context(),
  public.get_dashboard(uuid),
  public.publish_schedule(uuid),
  public.decide_leave_request(uuid, boolean, text),
  public.cancel_leave_request(uuid),
  public.report_sick_leave(uuid, date, date, text),
  public.acknowledge_sick_leave(uuid),
  public.get_sick_leave_comment(uuid),
  public.mark_notifications_read(uuid[]),
  public.register_device_token(public.device_platform, text, jsonb, text, text)
to authenticated;
