-- =============================================================================
-- Risk flags, audit log, data export / deletion, pause
-- =============================================================================
\o /dev/null
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Risk: a copied description at a suspiciously low price from a brand-new provider
begin;
update public.providers set status = 'verified', verified_at = now() where id = 'd0000000-0000-4000-8000-000000000004';
select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');
do $$
declare v_id uuid;
begin
  v_id := public.save_property(jsonb_build_object('category', 'house', 'title', 'Modern Family House', 'country', 'Zimbabwe', 'city', 'Harare',
    'area', 'Borrowdale', 'latitude', -17.75, 'longitude', 31.09, 'price', 20000, 'land_size_m2', 1200,
    'description', 'Modern four-bedroom family home located in Borrowdale with a large garden, double garage and excellent access to nearby shops and schools.'),
    null, array['d0000000-0000-4000-8000-000000000004/x/1.jpg'], '[]', true);
  perform set_config('test.scam_id', v_id::text, true);
end $$;
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$
declare
  l jsonb := public.admin_list_properties('pending');
  r jsonb;
begin
  r := (select x -> 'risk' from jsonb_array_elements(l) x where x ->> 'id' = current_setting('test.scam_id'));
  assert r ->> 'level' = 'high', 'scam-like listing is high risk: ' || r::text;
  assert r -> 'flags' ?& array['duplicate_description', 'duplicate_title_area', 'price_far_below_market', 'new_provider', 'few_photos'], 'all flags: ' || r::text;
  assert (l -> 0 ->> 'id') = current_setting('test.scam_id'), 'highest risk first';
  assert ((select x -> 'risk' from jsonb_array_elements(l) x where x ->> 'id' = 'e0000000-0000-4000-8000-000000000017') ->> 'level') in ('low', 'medium'), 'normal listing not high';
end $$;
rollback;

-- Audit log: admin changes recorded, immutable, admin-only
begin;
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$
declare a jsonb;
begin
  perform public.admin_moderate_property('e0000000-0000-4000-8000-000000000017', 'approve', null, false);
  perform public.admin_set_user_suspended('c0000000-0000-4000-8000-000000000001', true);
  a := public.admin_list_audit(10);
  assert jsonb_array_length(a) >= 2, 'entries written';
  assert exists (select 1 from jsonb_array_elements(a) x where x ->> 'entity_type' = 'properties' and x -> 'changes' -> 'status' ->> 'to' = 'active'
                 and x ->> 'actor_email' = 'admin@demo.property'), 'status change with actor';
  assert exists (select 1 from jsonb_array_elements(a) x where x ->> 'entity_type' = 'profiles' and x -> 'changes' ? 'is_suspended'), 'suspension';
  begin
    delete from public.audit_logs;
    raise exception 'audit deleted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.audit_logs set action = 'x';
    raise exception 'audit modified';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
do $$ begin
  assert (select count(*) from public.audit_logs) = 0, 'users cannot read the audit log';
end $$;
rollback;

-- Non-admin changes are not audited (keeps the log focused)
begin;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
update public.properties set price = price + 1 where id = 'e0000000-0000-4000-8000-000000000001';
reset role;
do $$ begin assert (select count(*) from public.audit_logs) = 0, 'owner edits not in audit log'; end $$;
rollback;

-- Pause / resume by the owner; paused listings are not public
begin;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
do $$ begin
  update public.properties set status = 'paused' where id = 'e0000000-0000-4000-8000-000000000001';
  assert (select status from public.properties where id = 'e0000000-0000-4000-8000-000000000001') = 'paused', 'paused';
end $$;
select set_config('request.jwt.claims', '', true), set_config('role', 'anon', true);
do $$ begin assert public.get_property('e0000000-0000-4000-8000-000000000001') is null, 'paused not public'; end $$;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
do $$ begin
  update public.properties set status = 'active' where id = 'e0000000-0000-4000-8000-000000000001';
  assert (select status from public.properties where id = 'e0000000-0000-4000-8000-000000000001') = 'active', 'resumed without new review';
end $$;
rollback;

-- Export + deletion keeps anonymised payments
begin;
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
do $$
declare e jsonb := public.my_data_export();
begin
  assert e -> 'account' ->> 'email' = 'farai@demo.property', 'account';
  assert jsonb_array_length(e -> 'payments') = 1 and jsonb_array_length(e -> 'saved_searches') = 1 and jsonb_array_length(e -> 'favorites') = 1, 'own data';
  assert not (e -> 'payments' -> 0 ? 'poll_url'), 'no internal fields';
end $$;
reset role;
delete from auth.users where id = 'c0000000-0000-4000-8000-000000000002';
do $$ begin
  assert not exists (select 1 from public.profiles where id = 'c0000000-0000-4000-8000-000000000002'), 'profile gone';
  assert exists (select 1 from public.payments where external_reference = 'seed-1' and user_id is null), 'payment kept anonymised';
end $$;
rollback;
\o
\echo '  ✓ trust & privacy tests'
