-- =============================================================================
-- Pulshift · Konto-Löschung in der App beantragen (App Store 5.1.1(v), Google Play)
--
-- The user starts the deletion inside the app. The administration of every
-- facility the person works for is notified and closes the request: access is
-- blocked right away (employee deactivated). The operator then deletes the
-- sign-in account and profile within 30 days (see privacy policy); rosters and
-- absences the facility must keep under employment law stay until the end of
-- their retention period.
-- =============================================================================

create table public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  note         text check (char_length(note) <= 500),
  status       text not null default 'open' check (status in ('open', 'done', 'withdrawn')),
  requested_at timestamptz not null default now(),
  handled_by   uuid references public.users (id) on delete set null,
  handled_at   timestamptz
);
create unique index account_deletion_requests_open on public.account_deletion_requests (user_id) where status = 'open';

comment on table public.account_deletion_requests is
  'Konto-Löschung, in der App beantragt. Written only through RPCs.';

alter table public.account_deletion_requests enable row level security;
grant select on public.account_deletion_requests to authenticated;

-- Admins (employees.manage, hospital-wide) of a facility the person works for.
create or replace function private.deletion_request_admin_hospitals(p_user_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.hospital_id from public.employees e
  where e.user_id = p_user_id and e.hospital_id in (select private.hospitals_with_permission('employees.manage'))
$$;
grant execute on function private.deletion_request_admin_hospitals(uuid) to authenticated;

create policy account_deletion_requests_select on public.account_deletion_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from private.deletion_request_admin_hospitals(user_id)));

create trigger account_deletion_requests_audit
  after insert or update or delete on public.account_deletion_requests
  for each row execute function private.audit_row();

create or replace function public.request_account_deletion(p_note text default null)
returns public.account_deletion_requests
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_req public.account_deletion_requests;
  h     record;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_req from public.account_deletion_requests where user_id = (select auth.uid()) and status = 'open';
  if v_req.id is not null then
    return v_req;   -- already requested: idempotent
  end if;
  insert into public.account_deletion_requests (user_id, note)
  values ((select auth.uid()), nullif(btrim(p_note), ''))
  returning * into v_req;

  for h in
    select e.hospital_id, e.id as employee_id from public.employees e where e.user_id = (select auth.uid())
  loop
    perform private.notify_users(
      h.hospital_id,
      array(
        select distinct holder.user_id
        from public.employee_roles er
        join public.role_permissions rp on rp.role_id = er.role_id and rp.permission_key = 'employees.manage'
        join public.employees holder on holder.id = er.employee_id and holder.status = 'active'
        where er.hospital_id = h.hospital_id and er.unit_id is null and er.department_id is null
          and (er.valid_until is null or er.valid_until > now())),
      'account_deletion_requested',
      jsonb_build_object('request_id', v_req.id, 'employee_name', private.employee_name(h.employee_id)),
      'account_deletion_request', v_req.id);
  end loop;
  return v_req;
end;
$$;

create or replace function public.withdraw_account_deletion()
returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.account_deletion_requests set status = 'withdrawn'
  where user_id = (select auth.uid()) and status = 'open'
$$;

-- Open requests of people in this facility (administration only).
create or replace function public.get_account_deletion_requests(p_hospital_id uuid)
returns table (id uuid, employee_id uuid, first_name text, last_name text, email text, note text, requested_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_hospital_id not in (select private.hospitals_with_permission('employees.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select r.id, e.id, u.first_name, u.last_name, u.email, r.note, r.requested_at
  from public.account_deletion_requests r
  join public.employees e on e.user_id = r.user_id and e.hospital_id = p_hospital_id
  join public.users u on u.id = r.user_id
  where r.status = 'open'
  order by r.requested_at;
end;
$$;

-- Administration closes the request: access to this facility is blocked now.
create or replace function public.complete_account_deletion(p_request_id uuid, p_hospital_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_req public.account_deletion_requests;
begin
  select * into v_req from public.account_deletion_requests where id = p_request_id and status = 'open' for update;
  if v_req.id is null or p_hospital_id not in (select private.hospitals_with_permission('employees.manage'))
     or not exists (select 1 from public.employees e where e.user_id = v_req.user_id and e.hospital_id = p_hospital_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_req.user_id = (select auth.uid()) then
    raise exception 'You cannot close your own request' using errcode = '42501';
  end if;
  update public.employees set status = 'inactive' where user_id = v_req.user_id and hospital_id = p_hospital_id;
  -- done once no facility has active access any more
  if not exists (select 1 from public.employees e where e.user_id = v_req.user_id and e.status = 'active') then
    update public.account_deletion_requests set status = 'done', handled_by = (select auth.uid()), handled_at = now()
    where id = v_req.id;
  end if;
end;
$$;

revoke execute on function
  public.request_account_deletion(text), public.withdraw_account_deletion(),
  public.get_account_deletion_requests(uuid), public.complete_account_deletion(uuid, uuid)
from public, anon;
grant execute on function
  public.request_account_deletion(text), public.withdraw_account_deletion(),
  public.get_account_deletion_requests(uuid), public.complete_account_deletion(uuid, uuid)
to authenticated;
