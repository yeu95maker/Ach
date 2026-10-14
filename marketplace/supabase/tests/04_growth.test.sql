-- =============================================================================
-- Founding badge and partner referrals
-- =============================================================================
\o /dev/null
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

begin;
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');  -- Tariro becomes a provider via a partner link
do $$ begin
  assert (select count(*) from public.partners) = 0, 'partners are not visible to users';
  insert into public.providers (owner_id, display_name, provider_type, referral_code, is_founding)
  values (auth.uid(), 'Tariro Homes', 'owner', ' hre-tino ', true);
  assert (select referral_code = 'HRE-TINO' and not is_founding from public.providers where owner_id = auth.uid()), 'code normalised, founding not self-assigned';
  update public.providers set referral_code = 'OTHER', is_founding = true where owner_id = auth.uid();
  assert (select referral_code = 'HRE-TINO' and not is_founding from public.providers where owner_id = auth.uid()), 'referral and founding not editable';
end $$;
rollback;

begin;
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  insert into public.providers (owner_id, display_name, provider_type, referral_code) values (auth.uid(), 'Tariro Homes', 'owner', 'NOPE-123');
  assert (select referral_code is null from public.providers where owner_id = auth.uid()), 'unknown code dropped';
  begin
    perform public.admin_list_partners();
    raise exception 'user listed partners';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$
declare p jsonb;
begin
  perform public.admin_save_partner('hre-rudo', 'Rudo', null, true);
  p := (select x from jsonb_array_elements(public.admin_list_partners(1)) x where x ->> 'code' = 'HRE-TINO');
  assert (p ->> 'providers')::int = 2 and (p ->> 'verified')::int = 1, 'partner counts';
  assert (p ->> 'qualified')::int = 1, 'Kudzai (verified, 4 active listings) qualifies at min 1';
  assert ((select x from jsonb_array_elements(public.admin_list_partners(5)) x where x ->> 'code' = 'HRE-TINO') ->> 'qualified')::int = 0, 'not at min 5';
  assert jsonb_array_length(public.admin_list_partners()) = 2, 'two partners';
  perform public.admin_set_founding('d0000000-0000-4000-8000-000000000002', true);
  assert (public.get_provider_profile('d0000000-0000-4000-8000-000000000002') ->> 'founding')::boolean, 'founding on profile';
  assert (public.get_property('e0000000-0000-4000-8000-000000000001') -> 'provider' ->> 'founding')::boolean, 'founding on property';
end $$;
rollback;

\o
\echo '  ✓ growth tests'
