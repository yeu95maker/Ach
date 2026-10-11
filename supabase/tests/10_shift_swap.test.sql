-- =============================================================================
-- Diensttausch mit Genehmigung
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set mira  '00000000-0000-4000-a000-000000000004'
\set hanna '00000000-0000-4000-a000-000000000006'

create temp table _sw (k text primary key, v text);
grant all on _sw to authenticated;

-- Anna's upcoming published shifts on 3A (not involved in anything yet)
do $$
declare
  r record;
  i int := 0;
begin
  for r in
    select se.id from public.schedule_entries se
    join public.schedules s on s.id = se.schedule_id and s.status = 'published' and s.unit_id = '30000000-0000-4000-a000-000000000001'
    where se.employee_id = '40000000-0000-4000-a000-000000000001' and se.kind = 'shift' and se.starts_at > now() + interval '1 day'
    order by se.starts_at
  loop
    i := i + 1;
    insert into _sw values ('a' || i, r.id::text);
  end loop;
  assert i >= 4, format('fixture: Anna has at least 4 upcoming shifts (%s)', i);
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Options, request, colleague accepts, lead approves → roster swapped
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  o record;
  w public.shift_swaps;
  kk text;
begin
  -- the first of Anna's shifts with a real swap partner (not the lead)
  for kk in select s.k from _sw s where s.k like 'a%' order by s.k loop
    select * into o from public.get_swap_options((select v::uuid from _sw where _sw.k = kk) ) x
    where x.partner_entry_id is not null and x.partner_id <> '40000000-0000-4000-a000-000000000004'
    limit 1;
    exit when o.partner_id is not null;
  end loop;
  assert o.partner_id is not null, 'fixture: a swap option exists';
  assert not exists (select 1 from public.get_swap_options((select v::uuid from _sw where _sw.k = kk)) x
                     where x.partner_id = '40000000-0000-4000-a000-000000000001'), 'not offered to herself';

  w := public.request_shift_swap((select v::uuid from _sw where _sw.k = kk), o.partner_id, o.partner_entry_id, 'Familienfeier');
  assert w.status = 'pending_partner', 'waits for the colleague';
  insert into _sw values ('swap', w.id::text), ('used', kk), ('partner', o.partner_id::text),
                         ('mine', w.requester_entry_id::text), ('theirs', o.partner_entry_id::text);

  begin
    perform public.request_shift_swap(w.requester_entry_id, o.partner_id, null, null);
    raise exception 'second open request must fail';
  exception when unique_violation then null;
  end;
  assert (select count(*) from public.get_shift_swaps() g where g.id = w.id and g.role = 'requester') = 1, 'requester sees it';
end;
$$;
commit;

do $$
declare
  partner_user uuid := (select e.user_id from public.employees e where e.id = (select v::uuid from _sw where k = 'partner'));
begin
  assert exists (select 1 from public.notifications where type = 'swap_requested' and recipient_id = partner_user
                 and entity_id = (select v::uuid from _sw where k = 'swap')), 'colleague is asked';
  insert into _sw values ('partner_user', partner_user::text);
end;
$$;

-- the lead neither sees nor decides it before the colleague agreed
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.get_shift_swaps() g where g.id = (select v::uuid from _sw where k = 'swap')),
    'lead does not see requests the colleague has not answered';
  begin
    perform public.decide_shift_swap((select v::uuid from _sw where k = 'swap'), true, null);
    raise exception 'deciding before the colleague agreed must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.respond_shift_swap((select v::uuid from _sw where k = 'swap'), true);
    raise exception 'only the colleague may answer';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

select set_config('test.partner', (select v from _sw where k = 'partner_user'), false);
begin;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.partner'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  w public.shift_swaps;
begin
  w := public.respond_shift_swap((select v::uuid from _sw where k = 'swap'), true);
  assert w.status = 'pending_lead', 'colleague agreed';
end;
$$;
commit;

do $$
begin
  assert exists (select 1 from public.notifications where type = 'swap_pending' and recipient_id = '00000000-0000-4000-a000-000000000004'
                 and entity_id = (select v::uuid from _sw where k = 'swap')), 'lead is asked to approve';
  assert not exists (select 1 from public.notifications where type = 'swap_pending'
                     and recipient_id in ('00000000-0000-4000-a000-000000000001', current_setting('test.partner')::uuid)
                     and entity_id = (select v::uuid from _sw where k = 'swap')), 'the two involved are not asked to approve';
  delete from public.notifications where type = 'schedule_changed';
end;
$$;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g record;
  w public.shift_swaps;
begin
  select * into g from public.get_shift_swaps() x where x.id = (select v::uuid from _sw where k = 'swap');
  assert g.role = 'lead' and g.status = 'pending_lead', 'lead sees the request';
  assert g.requester_name = 'Anna Becker' and g.partner_entry_id is not null, 'with names and both shifts';
  w := public.decide_shift_swap(g.id, true, null);
  assert w.status = 'approved', 'approved';
end;
$$;
commit;

do $$
declare
  partner uuid := (select v::uuid from _sw where k = 'partner');
begin
  assert (select employee_id from public.schedule_entries where id = (select v::uuid from _sw where k = 'mine')) = partner,
    'colleague now works Anna''s shift';
  assert (select employee_id from public.schedule_entries where id = (select v::uuid from _sw where k = 'theirs'))
       = '40000000-0000-4000-a000-000000000001', 'Anna now works the colleague''s shift';
  assert (select count(*) from public.notifications where type = 'swap_approved' and entity_id = (select v::uuid from _sw where k = 'swap')) = 2,
    'both are told';
  assert not exists (select 1 from public.notifications where type = 'schedule_changed'), 'no extra "roster changed" notifications';
  assert not exists (select 1 from public.notifications where type = 'open_shift'
                     and entity_id = (select v::uuid from _sw where k = 'mine')), 'the short gap is not announced as an open shift';
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Colleague declines a hand-over; lead rejects; requester withdraws
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  -- hand-overs to Leyla (free on several of Anna's days)
  free uuid[] := array(
    select a.v::uuid from _sw a
    where a.k like 'a%' and a.k <> (select v from _sw where k = 'used')
      and exists (select 1 from public.get_swap_options(a.v::uuid) x
                  where x.partner_id = '40000000-0000-4000-a000-000000000003' and x.partner_entry_id is null)
    order by a.k);
  p uuid := '40000000-0000-4000-a000-000000000003';
  w public.shift_swaps;
begin
  assert cardinality(free) >= 3, format('fixture: 3 hand-overs to Leyla possible (%s)', cardinality(free));
  w := public.request_shift_swap(free[1], p, null, null);
  insert into _sw values ('declined', w.id::text);
  w := public.request_shift_swap(free[2], p, null, null);
  insert into _sw values ('rejected', w.id::text), ('rejected_entry', free[2]::text);
  w := public.request_shift_swap(free[3], p, null, null);
  w := public.cancel_shift_swap(w.id);
  assert w.status = 'cancelled', 'withdrawn';
  insert into _sw values ('cancelled', w.id::text);
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (public.respond_shift_swap((select v::uuid from _sw where k = 'declined'), false)).status = 'declined', 'declined';
  assert (public.respond_shift_swap((select v::uuid from _sw where k = 'rejected'), true)).status = 'pending_lead', 'accepted';
  begin
    perform public.respond_shift_swap((select v::uuid from _sw where k = 'cancelled'), true);
    raise exception 'a withdrawn request cannot be accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (public.decide_shift_swap((select v::uuid from _sw where k = 'rejected'), false, 'Bitte mit der Nachtbesetzung klären')).status = 'rejected',
    'rejected';
end;
$$;
commit;

do $$
begin
  assert exists (select 1 from public.notifications where type = 'swap_declined' and recipient_id = '00000000-0000-4000-a000-000000000001'
                 and entity_id = (select v::uuid from _sw where k = 'declined')), 'requester hears the colleague said no';
  assert (select count(*) from public.notifications where type = 'swap_rejected'
          and entity_id = (select v::uuid from _sw where k = 'rejected')
          and payload ->> 'note' = 'Bitte mit der Nachtbesetzung klären') = 2, 'both hear the rejection with the reason';
  assert (select employee_id from public.schedule_entries where id = (select v::uuid from _sw where k = 'rejected_entry'))
       = '40000000-0000-4000-a000-000000000001', 'rejected: roster unchanged';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Hard rules: absence of the colleague blocks the request
-- -----------------------------------------------------------------------------
begin;
do $$
declare
  e public.schedule_entries;
begin
  select * into e from public.schedule_entries where id = (select v::uuid from _sw where k = 'rejected_entry');
  insert into public.sick_leaves (hospital_id, employee_id, start_date, end_date, status)
  values ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', e.entry_date, e.entry_date, 'reported');
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.get_swap_options((select v::uuid from _sw where k = 'rejected_entry')) x
                     where x.partner_id = '40000000-0000-4000-a000-000000000003'), 'sick colleague is not offered';
  begin
    perform public.request_shift_swap((select v::uuid from _sw where k = 'rejected_entry'), '40000000-0000-4000-a000-000000000003', null, null);
    raise exception 'request to a sick colleague must fail';
  exception when exclusion_violation then null;
  end;
  -- someone else's shift cannot be offered
  begin
    perform public.get_swap_options((select v::uuid from _sw where k = 'mine'));
    raise exception 'not own shift';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- -----------------------------------------------------------------------------
-- 4. Nobody approves their own swap
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  free uuid := (select v::uuid from _sw where k = 'rejected_entry');
  o record;
  w public.shift_swaps;
begin
  select * into o from public.get_swap_options(free) x where x.partner_id = '40000000-0000-4000-a000-000000000004' limit 1;
  assert o.partner_id is not null, 'fixture: swap with Mira possible';
  w := public.request_shift_swap(free, o.partner_id, o.partner_entry_id, null);
  perform set_config('test.own', w.id::text, true);
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
do $$
begin
  perform public.respond_shift_swap(current_setting('test.own')::uuid, true);
  begin
    perform public.decide_shift_swap(current_setting('test.own')::uuid, true, null);
    raise exception 'own swap must not be approved by oneself';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- -----------------------------------------------------------------------------
-- 5. Tenant isolation
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'hanna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.shift_swaps) = 0, 'other hospital sees no swaps (RLS)';
  assert (select count(*) from public.get_shift_swaps()) = 0, 'other hospital gets no swaps (RPC)';
  begin
    perform public.decide_shift_swap((select v::uuid from _sw where k = 'swap'), false, null);
    raise exception 'other hospital cannot decide';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

begin;
set local role authenticated;
do $$
begin
  insert into public.shift_swaps (hospital_id, unit_id, requester_id, requester_entry_id, partner_id)
  values ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
          '40000000-0000-4000-a000-000000000001', (select v::uuid from _sw where k = 'a1'), '40000000-0000-4000-a000-000000000002');
  raise exception 'direct insert must fail';
exception when insufficient_privilege then null;
end;
$$;
rollback;

\o
\echo '  ✓ Diensttausch assertions passed'
