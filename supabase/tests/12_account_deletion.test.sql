-- =============================================================================
-- Konto-Löschung in der App beantragen
-- =============================================================================
\o /dev/null
\set leyla '00000000-0000-4000-a000-000000000003'
\set mira  '00000000-0000-4000-a000-000000000004'
\set admin '00000000-0000-4000-a000-000000000007'
\set tom   '00000000-0000-4000-a000-000000000008'

-- Leyla requests deletion (twice: idempotent), sees her own request
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'leyla', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  a public.account_deletion_requests;
  b public.account_deletion_requests;
begin
  a := public.request_account_deletion('Ich verlasse das Haus');
  b := public.request_account_deletion(null);
  assert a.id = b.id and a.status = 'open', 'one open request';
  assert (select count(*) from public.account_deletion_requests) = 1, 'sees own request';
  perform set_config('test.req', a.id::text, false);
end;
$$;
commit;

do $$
begin
  assert exists (select 1 from public.notifications where type = 'account_deletion_requested'
                 and recipient_id = '00000000-0000-4000-a000-000000000007'), 'hospital administration is notified';
  assert not exists (select 1 from public.notifications where type = 'account_deletion_requested'
                     and recipient_id = '00000000-0000-4000-a000-000000000004'), 'ward lead (no employees.manage) is not';
end;
$$;

-- the ward lead and another hospital cannot see or close it
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.account_deletion_requests) = 0, 'ward lead sees no requests';
  begin
    perform public.complete_account_deletion(current_setting('test.req')::uuid, '10000000-0000-4000-a000-000000000001');
    raise exception 'ward lead must not close';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.account_deletion_requests) = 0, 'other hospital sees nothing';
end;
$$;
rollback;

-- administration lists and closes it → access blocked
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.get_account_deletion_requests('10000000-0000-4000-a000-000000000001') x limit 1;
  assert r.first_name = 'Leyla' and r.note = 'Ich verlasse das Haus', 'admin sees the request';
  perform public.complete_account_deletion(r.id, '10000000-0000-4000-a000-000000000001');
end;
$$;
rollback;   -- keep Leyla active for the other suites

do $$
begin
  -- withdrawing is possible while open
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-000000000003', 'role', 'authenticated')::text, true);
  perform public.withdraw_account_deletion();
  assert (select status from public.account_deletion_requests where id = current_setting('test.req')::uuid) = 'withdrawn', 'withdrawn';
end;
$$;

-- the closing actually deactivates (checked in a rolled-back transaction)
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'leyla', 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.req2', (public.request_account_deletion(null)).id::text, true);
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
select public.complete_account_deletion(current_setting('test.req2')::uuid, '10000000-0000-4000-a000-000000000001');
reset role;
do $$
begin
  assert (select status from public.employees where id = '40000000-0000-4000-a000-000000000003') = 'inactive', 'access blocked';
  assert (select status from public.account_deletion_requests where id = current_setting('test.req2')::uuid) = 'done', 'request done';
end;
$$;
rollback;

\o
\echo '  ✓ Konto-Löschung assertions passed'
