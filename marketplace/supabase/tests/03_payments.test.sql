-- =============================================================================
-- Paynow payment lifecycle: pending → succeeded (idempotent) / failed, amount
-- checks, service-role only, prepaid periods extend instead of renewing.
-- =============================================================================
\o /dev/null
\set tariro 'c0000000-0000-4000-8000-000000000001'

begin;
set local role service_role;
do $$
declare
  u uuid := 'c0000000-0000-4000-8000-000000000001';
  r jsonb;
  v_end timestamptz;
begin
  r := public.billing_start_payment(u, 'month', 'paynow', 'PF-TEST-1', 'ecocash', 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=x');
  assert (r ->> 'amount')::numeric = 9, 'amount from app_settings';
  assert (public.billing_get_payment('paynow', 'PF-TEST-1') ->> 'status') = 'pending', 'pending';
  assert not private.is_premium(u), 'not premium while pending';

  begin
    perform public.billing_record_payment(u, 'month', 'paynow', 'PF-TEST-1', 1, 'USD');
    raise exception 'underpayment accepted';
  exception when others then
    if position('PAYMENT_MISMATCH' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.billing_record_payment(u, 'month', 'paynow', 'PF-TEST-1', 9, 'USD');
  assert private.is_premium(u), 'premium after payment';
  assert (select count(*) from public.payments where external_reference = 'PF-TEST-1') = 1, 'pending row settled, not duplicated';
  assert (select status from public.payments where external_reference = 'PF-TEST-1') = 'succeeded', 'succeeded';
  assert (select not auto_renew from public.memberships where user_id = u), 'prepaid membership does not auto-renew';
  assert (public.billing_record_payment(u, 'month', 'paynow', 'PF-TEST-1', 9, 'USD') ->> 'duplicate')::boolean, 'idempotent';

  -- a second payment extends from the current period end
  v_end := (select current_period_end from public.memberships where user_id = u);
  perform public.billing_start_payment(u, 'year', 'paynow', 'PF-TEST-2', 'web', null);
  perform public.billing_record_payment(u, 'year', 'paynow', 'PF-TEST-2', 90, 'USD');
  assert (select current_period_end from public.memberships where user_id = u) = v_end + interval '1 year', 'extended by a year';

  perform public.billing_start_payment(u, 'month', 'paynow', 'PF-TEST-3', 'onemoney', null);
  perform public.billing_fail_payment('paynow', 'PF-TEST-3', 'PN123');
  assert (select status = 'failed' and provider_reference = 'PN123' from public.payments where external_reference = 'PF-TEST-3'), 'failed';
end $$;
rollback;

-- Users cannot touch payment functions or read poll URLs; prepaid cannot be "cancelled"
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tariro', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.billing_start_payment(auth.uid(), 'month', 'paynow', 'X', 'web', null);
    raise exception 'user started payment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.billing_get_payment('paynow', 'X');
    raise exception 'user read payment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform poll_url from public.payments;
    raise exception 'user read poll url';
  exception when insufficient_privilege then null;
  end;
  perform id, status, amount from public.payments;
end $$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', 'c0000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.cancel_membership();
  assert (public.my_account() -> 'membership' ->> 'status') = 'active', 'prepaid membership is not cancelled';
  assert (public.my_account() -> 'membership' ->> 'auto_renew') = 'false', 'auto_renew exposed';
end $$;
rollback;

\o
\echo '  ✓ payment tests'
