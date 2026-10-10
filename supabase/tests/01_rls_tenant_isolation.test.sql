-- =============================================================================
-- RLS test suite: tenant isolation, role permissions, workflows.
-- Every block impersonates a user exactly like PostgREST does
-- (role `authenticated` + request.jwt.claims) and asserts what is visible.
-- Each scenario runs in its own transaction and is rolled back.
-- =============================================================================

-- Users
--   anna  00000000-0000-4000-a000-000000000001  nurse            Klinikum / 3A
--   jonas 00000000-0000-4000-a000-000000000002  nurse + shift lead (charge nurse)  Klinikum / 3A
--   leyla 00000000-0000-4000-a000-000000000003  nurse (sick)     Klinikum / 3A
--   mira  00000000-0000-4000-a000-000000000004  head nurse = Stationsleitung (unit scope)  Klinikum / 3A
--   paul  00000000-0000-4000-a000-000000000005  head nurse = PDL (department scope)  Klinikum / Innere
--   hanna 00000000-0000-4000-a000-000000000006  HR               Klinikum
--   tom   00000000-0000-4000-a000-000000000008  nurse            St. Marien
--   ops   00000000-0000-4000-a000-000000000010  system admin

\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set jonas '00000000-0000-4000-a000-000000000002'
\set mira  '00000000-0000-4000-a000-000000000004'
\set hanna '00000000-0000-4000-a000-000000000006'
\set tom   '00000000-0000-4000-a000-000000000008'
\set ops   '00000000-0000-4000-a000-000000000010'

-- -----------------------------------------------------------------------------
-- Anonymous: no access at all
-- -----------------------------------------------------------------------------
begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.hospitals;
    raise exception 'anon must not read hospitals';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.my_context();
    raise exception 'anon must not call RPCs';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Nurse (Anna): sees only her hospital, only her own HR data
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n integer;
begin
  assert (select count(*) from public.hospitals) = 1, 'nurse sees exactly one hospital';
  assert (select name from public.hospitals) = 'Klinikum Musterstadt', 'nurse sees her hospital';
  assert (select count(*) from public.units) = 3, 'nurse sees only own hospital units';
  assert not exists (select 1 from public.units where hospital_id = '10000000-0000-4000-a000-000000000002'), 'no foreign units';

  -- Seed history (ids 81…/91…, archived rosters) is excluded from the counts below.
  -- schedules: published (+ archived history) only, own hospital only
  assert (select count(*) from public.schedules where status = 'published') = 1, 'nurse sees only the published roster of her hospital';
  assert not exists (select 1 from public.schedules where status = 'draft'), 'nurse sees no drafts';
  assert (select count(*) from public.schedules where status = 'archived') = 24, 'nurse sees the archived history';
  assert not exists (select 1 from public.schedules where hospital_id = '10000000-0000-4000-a000-000000000002'), 'no foreign rosters';
  assert not exists (select 1 from public.schedule_entries where hospital_id = '10000000-0000-4000-a000-000000000002'), 'no foreign shifts';
  assert not exists (select 1 from public.schedule_entries where schedule_id = '70000000-0000-4000-a000-000000000002'), 'no draft shifts';
  assert exists (select 1 from public.shift_roster where employee_id = '40000000-0000-4000-a000-000000000002'), 'nurse sees colleagues shifts';

  -- directory vs. raw HR tables
  assert (select count(*) from public.employee_directory) = 7, 'directory lists the 7 colleagues of the own hospital';
  assert not exists (select 1 from public.employee_directory where hospital_id = '10000000-0000-4000-a000-000000000002'), 'directory is tenant-filtered';
  assert (select count(*) from public.users) = 1, 'nurse reads only her own full profile';
  assert (select count(*) from public.employees) = 1, 'nurse reads only her own employment';

  -- absences
  assert (select count(*) from public.leave_requests where left(id::text, 2) <> '81') = 2, 'nurse sees only own leave requests';
  assert (select count(*) from public.sick_leaves where left(id::text, 2) <> '91') = 0, 'nurse has no access to the sick_leaves table of colleagues';
  -- …but may see WHO on her ward is sick (decision 2026-10-10), never the reason
  assert (select count(*) from public.colleague_sick_leaves) = 1, 'nurse sees that a ward colleague is sick';
  assert (select employee_id from public.colleague_sick_leaves) = '40000000-0000-4000-a000-000000000003', 'it is Leyla';
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'colleague_sick_leaves'
                       and column_name in ('comment_encrypted', 'status', 'certificate_document_id')),
    'view exposes no reason, status or certificate';
  -- vacation of colleagues stays invisible
  assert not exists (select 1 from public.leave_requests where employee_id <> '40000000-0000-4000-a000-000000000001'),
    'nurse never sees vacation of colleagues';
  assert (select count(*) from public.audit_logs) = 0, 'nurse cannot read audit logs';

  -- notifications only own
  assert not exists (select 1 from public.notifications where recipient_id <> auth.uid()), 'only own notifications';

  -- context
  assert jsonb_array_length(public.my_context() -> 'employments') = 1, 'one employment';
  assert (public.my_context() -> 'employments' -> 0 -> 'permissions') ? 'leave.request', 'nurse may request leave';
  assert not ((public.my_context() -> 'employments' -> 0 -> 'permissions') ? 'leave.approve'), 'nurse may not approve';

  -- encrypted column is not even selectable
  begin
    perform comment_encrypted from public.sick_leaves;
    raise exception 'comment_encrypted must not be selectable';
  exception when insufficient_privilege then null;
  end;

  -- cannot read a colleague's sick note
  begin
    perform public.get_sick_leave_comment('90000000-0000-4000-a000-000000000001');
    raise exception 'nurse must not read sick leave comments of others';
  exception when insufficient_privilege then null;
  end;

  -- cannot request leave in someone else's name
  begin
    insert into public.leave_requests (employee_id, start_date, end_date)
    values ('40000000-0000-4000-a000-000000000002', current_date + 100, current_date + 101);
    raise exception 'leave request for colleague must fail';
  exception when insufficient_privilege then null;
  end;

  -- cannot set server-controlled columns
  begin
    insert into public.leave_requests (employee_id, start_date, end_date, status)
    values ('40000000-0000-4000-a000-000000000001', current_date + 100, current_date + 101, 'approved');
    raise exception 'status must not be insertable';
  exception when insufficient_privilege then null;
  end;

  -- own request works and starts as pending
  insert into public.leave_requests (employee_id, start_date, end_date, comment)
  values ('40000000-0000-4000-a000-000000000001', current_date + 120, current_date + 125, 'Test');
  assert (select status from public.leave_requests where comment = 'Test') = 'pending', 'own request is pending';
  assert (select hospital_id from public.leave_requests where comment = 'Test') = '10000000-0000-4000-a000-000000000001', 'tenant derived server-side';

  -- workflow RPCs are protected
  begin
    perform public.decide_leave_request((select id from public.leave_requests where comment = 'Test'), true);
    raise exception 'nurse must not decide leave';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_schedule('70000000-0000-4000-a000-000000000002');
    raise exception 'nurse must not publish';
  exception when insufficient_privilege then null;
  end;

  -- direct status manipulation is impossible
  begin
    update public.leave_requests set status = 'approved';
    raise exception 'status must not be updatable';
  exception when insufficient_privilege then null;
  end;

  -- cannot write schedules
  begin
    insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, entry_date)
    values ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001',
            '40000000-0000-4000-a000-000000000001', 'off', current_date);
    raise exception 'nurse must not write schedule entries';
  exception when insufficient_privilege then null;
  end;

  -- own profile: editable fields only
  update public.users set first_name = 'Annika' where id = auth.uid();
  assert (select first_name from public.users where id = auth.uid()) = 'Annika', 'profile updated';
  begin
    update public.users set email = 'evil@example.com' where id = auth.uid();
    raise exception 'email must not be updatable';
  exception when insufficient_privilege then null;
  end;
  update public.users set first_name = 'Hacked' where id = '00000000-0000-4000-a000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'cannot update other profiles';

  -- report sick leave (encrypted) and read own comment back
  perform public.report_sick_leave('40000000-0000-4000-a000-000000000001', current_date + 40, current_date + 41, 'Migräne');
  assert public.get_sick_leave_comment((select id from public.sick_leaves where start_date = current_date + 40)) = 'Migräne',
    'own sick comment readable';

  -- dashboard
  assert (public.get_dashboard('40000000-0000-4000-a000-000000000001') ->> 'pending_approvals')::int = 0, 'nurse has no approvals';
  begin
    perform public.get_dashboard('40000000-0000-4000-a000-000000000002');
    raise exception 'dashboard of colleague must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Stationsleitung (Mira, head nurse with unit scope 3A): manages her ward, nothing else
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.schedules where status <> 'archived') = 2, 'charge nurse sees published + draft roster of 3A';
  assert (select count(*) from public.users) = 4, 'charge nurse sees full profiles of her ward members';
  assert exists (select 1 from public.leave_requests where employee_id = '40000000-0000-4000-a000-000000000002' and status = 'pending'),
    'sees pending request of her team';
  assert (select count(*) from public.sick_leaves where left(id::text, 2) <> '91') = 1, 'sees sick leave of her team';
  assert public.get_sick_leave_comment('90000000-0000-4000-a000-000000000001') = 'Fieber, AU folgt', 'may read sick note';
  assert (public.get_dashboard('40000000-0000-4000-a000-000000000004') ->> 'pending_approvals')::int = 2, 'two approvals pending';

  -- approve → requester notified
  perform public.decide_leave_request('80000000-0000-4000-a000-000000000001', true, 'Passt');
  assert (select status from public.leave_requests where id = '80000000-0000-4000-a000-000000000001') = 'approved', 'approved';

  perform public.acknowledge_sick_leave('90000000-0000-4000-a000-000000000001');
  assert (select status from public.sick_leaves where id = '90000000-0000-4000-a000-000000000001') = 'acknowledged', 'acknowledged';

  -- publish the draft roster of her ward
  perform public.publish_schedule('70000000-0000-4000-a000-000000000002');

  -- edit an entry in her ward
  insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date)
  values ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000002', null, 'shift',
          '60000000-0000-4000-a000-000000000003', (date_trunc('month', current_date) + interval '1 month 3 days')::date);

  -- other hospital: invisible and not writable
  assert not exists (select 1 from public.schedules where hospital_id = '10000000-0000-4000-a000-000000000002'), 'no foreign rosters';
  begin
    perform public.publish_schedule('70000000-0000-4000-a000-000000000003');
    raise exception 'must not publish foreign roster';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, entry_date)
    values ('10000000-0000-4000-a000-000000000002', '70000000-0000-4000-a000-000000000003',
            '40000000-0000-4000-a000-000000000008', 'off', current_date);
    raise exception 'must not write foreign entries';
  exception when insufficient_privilege then null;
  end;

  -- cannot hand out roles
  begin
    insert into public.employee_roles (hospital_id, employee_id, role_id)
    select '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', id
    from public.roles where key = 'charge_nurse';
    raise exception 'charge nurse must not assign roles';
  exception when insufficient_privilege then null;
  end;
end $$;

-- side effects, checked with full rights
reset role;
do $$
begin
  assert exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-a000-000000000002' and type = 'leave_approved'),
    'Jonas notified about approval';
  assert exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-a000-000000000003' and type = 'sick_leave_updated'),
    'Leyla notified about acknowledgement';
  assert exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-a000-000000000001' and type = 'schedule_published'
                   and payload ->> 'schedule_id' = '70000000-0000-4000-a000-000000000002'), 'Anna notified about new roster';
  assert exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-a000-000000000002' and type = 'open_shift'),
    'ward notified about open shift';
  assert not exists (select 1 from public.notifications where recipient_id = '00000000-0000-4000-a000-000000000004'
                       and created_at = now()), 'actor is not notified about own actions';
  assert exists (select 1 from public.audit_logs where table_name = 'leave_requests' and action = 'UPDATE'
                   and actor_id = '00000000-0000-4000-a000-000000000004'), 'decision is audited with actor';
  assert not exists (select 1 from public.audit_logs where new_data ->> 'comment_encrypted' <> '***'), 'encrypted data is masked in audit';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Schichtleitung (Jonas, charge nurse 3A): organises the shift, decides nothing
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'jonas', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.sick_leaves where left(id::text, 2) <> '91') = 1, 'shift lead sees who is sick on her ward';
  assert (select count(*) from public.users) = 4, 'shift lead sees contact details of her ward';
  assert (select count(*) from public.schedules where status <> 'archived') = 1, 'shift lead does not see draft rosters';
  assert (select count(*) from public.leave_requests where employee_id <> '40000000-0000-4000-a000-000000000002') = 0,
    'shift lead does not see leave requests of others';
  begin
    perform public.get_sick_leave_comment('90000000-0000-4000-a000-000000000001');
    raise exception 'shift lead must not read medical comments';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.decide_leave_request('80000000-0000-4000-a000-000000000002', true);
    raise exception 'shift lead must not decide leave';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_schedule('70000000-0000-4000-a000-000000000002');
    raise exception 'shift lead must not publish';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, entry_date)
    values ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001',
            '40000000-0000-4000-a000-000000000001', 'off', current_date);
    raise exception 'shift lead must not edit the roster';
  exception when insufficient_privilege then null;
  end;
  assert (public.my_context() -> 'employments' -> 0 -> 'roles') ? 'charge_nurse', 'role is reported in context';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Separation of duties: nobody approves their own leave
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  insert into public.leave_requests (employee_id, start_date, end_date)
  values ('40000000-0000-4000-a000-000000000004', current_date + 200, current_date + 201)
  returning id into v_id;
  begin
    perform public.decide_leave_request(v_id, true);
    raise exception 'self approval must fail';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- HR (Hanna): sees sick periods but not the medical comment; no escalation
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'hanna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.sick_leaves where left(id::text, 2) <> '91') = 1, 'HR sees sick leave periods';
  assert (select count(*) from public.colleague_sick_leaves) = 0, 'colleague view is limited to shared wards';
  begin
    perform public.get_sick_leave_comment('90000000-0000-4000-a000-000000000001');
    raise exception 'HR must not read medical comments';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.decide_leave_request('80000000-0000-4000-a000-000000000001', true);
    raise exception 'HR must not approve leave';
  exception when insufficient_privilege then null;
  end;

  -- may assign a role whose permissions she holds herself
  insert into public.employee_roles (hospital_id, employee_id, role_id, unit_id)
  select '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', id, null
  from public.roles where key = 'hr';

  -- privilege escalation is blocked
  begin
    insert into public.employee_roles (hospital_id, employee_id, role_id)
    select '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000006', id
    from public.roles where key = 'hospital_admin';
    raise exception 'HR must not grant hospital_admin';
  exception when insufficient_privilege then null;
  end;

  -- other tenant untouchable
  begin
    insert into public.employee_roles (hospital_id, employee_id, role_id)
    select '10000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000008', id
    from public.roles where key = 'nurse';
    raise exception 'HR must not touch other hospitals';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Nurse of the other hospital (Tom) sees nothing of Klinikum Musterstadt
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.hospitals) = 1 and (select name from public.hospitals) = 'St. Marien Krankenhaus', 'own hospital only';
  assert (select count(*) from public.employee_directory) = 2, 'directory of own hospital';
  assert not exists (select 1 from public.schedule_entries where hospital_id = '10000000-0000-4000-a000-000000000001'), 'no foreign shifts';
  assert not exists (select 1 from public.announcements where hospital_id = '10000000-0000-4000-a000-000000000001'), 'no foreign announcements';
  assert not exists (select 1 from public.qualifications where hospital_id = '10000000-0000-4000-a000-000000000001'), 'no foreign qualifications';
  assert not exists (select 1 from public.user_languages where user_id = '00000000-0000-4000-a000-000000000001'), 'no foreign languages';
  assert not exists (select 1 from public.notifications where hospital_id = '10000000-0000-4000-a000-000000000001'), 'no foreign notifications';
  assert not exists (select 1 from public.colleague_sick_leaves where hospital_id = '10000000-0000-4000-a000-000000000001'), 'no foreign sick colleagues';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- System administrator: manages tenants, but no access to HR / health data
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'ops', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.hospitals) = 2, 'system admin sees all tenants';
  assert (select count(*) from public.employees) = 0, 'system admin sees no employees';
  assert (select count(*) from public.sick_leaves where left(id::text, 2) <> '91') = 0, 'system admin sees no sick leave';
  assert (select count(*) from public.audit_logs) > 0, 'system admin reads the platform audit log';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Storage: documents are only reachable through their metadata row
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.documents (hospital_id, employee_id, title, file_name, mime_type, size_bytes)
values ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', 'AU-Bescheinigung', 'au.pdf', 'application/pdf', 1000);
do $$
declare
  v_path text := (select storage_path from public.documents where title = 'AU-Bescheinigung');
begin
  assert v_path like '10000000-0000-4000-a000-000000000001/%/au.pdf', 'path derived server-side';
  insert into storage.objects (bucket_id, name, owner) values ('documents', v_path, auth.uid());
  begin
    insert into storage.objects (bucket_id, name, owner) values ('documents', '10000000-0000-4000-a000-000000000001/x/evil.pdf', auth.uid());
    raise exception 'upload without metadata must fail';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects (bucket_id, name, owner) values ('avatars', auth.uid()::text || '/avatar.webp', auth.uid());
  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', '00000000-0000-4000-a000-000000000002/avatar.webp', auth.uid());
    raise exception 'avatar of somebody else must fail';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', :'jonas', 'role', 'authenticated')::text, true);
do $$
begin
  assert not exists (select 1 from storage.objects where bucket_id = 'documents'), 'colleague cannot see private document';
  assert exists (select 1 from storage.objects where bucket_id = 'avatars'), 'colleague can see avatar';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
do $$
begin
  assert not exists (select 1 from storage.objects), 'other tenant sees no objects at all';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Data integrity constraints
-- -----------------------------------------------------------------------------
begin;
do $$
begin
  -- double booking
  begin
    insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date)
    select hospital_id, schedule_id, employee_id, 'shift', shift_type_id, entry_date
    from public.schedule_entries where kind = 'shift' and employee_id is not null limit 1;
    raise exception 'double booking must fail';
  exception when exclusion_violation then null;
  end;
  -- cross-tenant reference
  begin
    insert into public.employee_units (hospital_id, employee_id, unit_id)
    values ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000004');
    raise exception 'cross-tenant reference must fail';
  exception when foreign_key_violation then null;
  end;
  -- overlapping leave
  begin
    insert into public.leave_requests (employee_id, start_date, end_date)
    select employee_id, start_date, end_date from public.leave_requests where id = '80000000-0000-4000-a000-000000000002';
    raise exception 'overlapping leave must fail';
  exception when exclusion_violation then null;
  end;
  -- night shift spans midnight
  assert (select bool_and(ends_at::date > starts_at::date or (ends_at - starts_at) < interval '12 hours')
          from public.schedule_entries se join public.shift_types st on st.id = se.shift_type_id where st.category = 'night'),
    'night shifts end next day';
end $$;
rollback;

\echo '  ✓ RLS & integrity assertions passed'
