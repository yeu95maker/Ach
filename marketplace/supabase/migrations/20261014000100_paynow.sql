-- =============================================================================
-- Payments via Paynow (Zimbabwe: EcoCash, OneMoney, Visa/Mastercard, ZimSwitch)
--
-- Paynow has no card-on-file subscriptions, so memberships are prepaid periods:
-- every payment extends Premium by one month/year, nothing renews by itself.
-- Flow (all writes by the server with the service role):
--   1. billing_start_payment   → payments row 'pending' (reference, amount, poll URL)
--   2. Paynow result webhook / return-page poll → server verifies hash + polls Paynow
--   3. billing_record_payment  → 'succeeded', period applied (idempotent)
--      billing_fail_payment    → 'failed'
-- =============================================================================

alter table public.payments
  add column poll_url text check (char_length(poll_url) <= 500),
  add column payment_method text check (payment_method in ('web', 'ecocash', 'onemoney', 'demo', 'manual')),
  add column provider_reference text check (char_length(provider_reference) <= 200),
  add column settled_at timestamptz;

-- Recurring providers (cards on file) set this; prepaid periods (Paynow, demo, admin grants) don't renew.
alter table public.memberships add column auto_renew boolean not null default false;

-- Users may see their own payments but not the poll URL (server-side secret-ish).
revoke select on public.payments from authenticated;
grant select (id, user_id, amount, currency, status, payment_provider, external_reference, billing_interval,
              period_start, period_end, created_at, payment_method, settled_at) on public.payments to authenticated;

/** Extends Premium by one period. Settles an existing pending payment or books a new one. */
create or replace function private.apply_payment(
  p_user uuid, p_interval public.billing_interval, p_provider text, p_reference text,
  p_amount numeric, p_currency text, p_external_customer text default null, p_external_subscription text default null)
returns public.memberships
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_m public.memberships;
  v_start timestamptz;
  v_end timestamptz;
  v_recurring boolean := p_external_subscription is not null;
begin
  select * into v_m from public.memberships where user_id = p_user for update;
  v_start := case when found and v_m.status in ('active', 'canceled', 'past_due') and v_m.current_period_end > now()
                  then v_m.current_period_end else now() end;
  v_end := v_start + case when p_interval = 'year' then interval '1 year' else interval '1 month' end;

  update public.payments
     set status = 'succeeded', period_start = v_start, period_end = v_end, settled_at = now()
   where payment_provider = p_provider and external_reference = p_reference and status = 'pending';
  if not found then
    insert into public.payments (user_id, amount, currency, status, payment_provider, external_reference,
                                 billing_interval, period_start, period_end, settled_at)
    values (p_user, p_amount, p_currency, 'succeeded', p_provider, p_reference, p_interval, v_start, v_end, now());
  end if;

  insert into public.memberships (user_id, status, billing_interval, current_period_start, current_period_end,
                                  cancel_at_period_end, auto_renew, payment_provider, external_customer_id, external_subscription_id)
  values (p_user, 'active', p_interval, v_start, v_end, false, v_recurring, p_provider, p_external_customer, p_external_subscription)
  on conflict (user_id) do update set
    status = 'active', billing_interval = excluded.billing_interval,
    current_period_start = case when public.memberships.current_period_end > now() then public.memberships.current_period_start else excluded.current_period_start end,
    current_period_end = excluded.current_period_end, cancel_at_period_end = false, auto_renew = excluded.auto_renew,
    payment_provider = excluded.payment_provider,
    external_customer_id = coalesce(excluded.external_customer_id, public.memberships.external_customer_id),
    external_subscription_id = coalesce(excluded.external_subscription_id, public.memberships.external_subscription_id)
  returning * into v_m;

  perform private.notify(p_user, 'membership', 'premium_active', to_char(v_end, 'YYYY-MM-DD'), '/membership');
  return v_m;
end;
$$;

/** Server: remember a payment that was sent to the provider (amount fixed here, from app_settings). */
create or replace function public.billing_start_payment(
  p_user uuid, p_interval public.billing_interval, p_provider text, p_reference text,
  p_method text, p_poll_url text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.app_settings;
  v_amount numeric;
begin
  select * into s from public.app_settings;
  v_amount := case when p_interval = 'year' then s.premium_price_year else s.premium_price_month end;
  insert into public.payments (user_id, amount, currency, status, payment_provider, external_reference, billing_interval, payment_method, poll_url)
  values (p_user, v_amount, s.currency, 'pending', p_provider, p_reference, p_interval, p_method, p_poll_url);
  return jsonb_build_object('reference', p_reference, 'amount', v_amount, 'currency', s.currency);
end;
$$;

create or replace function public.billing_set_poll_url(p_provider text, p_reference text, p_poll_url text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.payments set poll_url = p_poll_url
  where payment_provider = p_provider and external_reference = p_reference and status = 'pending'
$$;

/** Server: the pending payment (incl. poll URL) to settle. */
create or replace function public.billing_get_payment(p_provider text, p_reference text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(p) from public.payments p where p.payment_provider = p_provider and p.external_reference = p_reference
$$;

/**
 * Server: settle a payment after the provider confirmed it. Idempotent – a
 * webhook and the return-page poll may both arrive. The paid amount must match.
 */
create or replace function public.billing_record_payment(
  p_user uuid, p_interval public.billing_interval, p_provider text, p_reference text,
  p_amount numeric, p_currency text, p_external_customer text default null, p_external_subscription text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_p public.payments;
begin
  select * into v_p from public.payments where payment_provider = p_provider and external_reference = p_reference for update;
  if found and v_p.status = 'succeeded' then
    return jsonb_build_object('duplicate', true);
  end if;
  if found and (v_p.user_id <> p_user or v_p.amount <> p_amount or v_p.currency <> p_currency or v_p.billing_interval <> p_interval) then
    raise exception 'PAYMENT_MISMATCH' using errcode = '22023';
  end if;
  return to_jsonb(private.apply_payment(p_user, p_interval, p_provider, p_reference, p_amount, p_currency, p_external_customer, p_external_subscription));
end;
$$;

create or replace function public.billing_fail_payment(p_provider text, p_reference text, p_provider_reference text default null) returns void
language sql volatile security definer set search_path = '' as $$
  update public.payments set status = 'failed', settled_at = now(), provider_reference = coalesce(p_provider_reference, provider_reference)
  where payment_provider = p_provider and external_reference = p_reference and status = 'pending'
$$;

create or replace function public.billing_set_provider_reference(p_provider text, p_reference text, p_provider_reference text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.payments set provider_reference = p_provider_reference
  where payment_provider = p_provider and external_reference = p_reference
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.billing_start_payment(uuid, public.billing_interval, text, text, text, text)',
    'public.billing_set_poll_url(text, text, text)',
    'public.billing_get_payment(text, text)',
    'public.billing_record_payment(uuid, public.billing_interval, text, text, numeric, text, text, text)',
    'public.billing_fail_payment(text, text, text)',
    'public.billing_set_provider_reference(text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

/** Cancel only makes sense for auto-renewing memberships; prepaid ones simply end. */
create or replace function public.cancel_membership() returns void
language sql volatile security definer set search_path = '' as $$
  update public.memberships set cancel_at_period_end = true, status = 'canceled'
  where user_id = auth.uid() and status = 'active' and auto_renew
$$;

-- my_account(): expose auto_renew
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', pr.id,
    'full_name', pr.full_name,
    'locale', pr.locale,
    'is_admin', pr.is_admin,
    'is_suspended', pr.is_suspended,
    'is_premium', private.is_premium(),
    'membership', (select jsonb_build_object(
        'status', m.status, 'billing_interval', m.billing_interval,
        'current_period_end', m.current_period_end, 'cancel_at_period_end', m.cancel_at_period_end,
        'auto_renew', m.auto_renew, 'payment_provider', m.payment_provider)
      from public.memberships m where m.user_id = auth.uid()),
    'provider', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status,
        'provider_type', p.provider_type, 'status_note', p.status_note)
      from public.providers p where p.owner_id = auth.uid()),
    'favorites_count', (select count(*) from public.favorites f where f.user_id = auth.uid()),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null),
    'unread_messages', (
      select count(*) from public.conversations c
      where (c.customer_id = auth.uid() and c.last_message_at > c.customer_last_read_at)
         or (c.provider_id = private.my_provider_id() and c.last_message_at > c.provider_last_read_at))
  ) end
  from public.profiles pr where pr.id = auth.uid()
$$;

-- Old pending payments that were never completed (cron, service role)
create or replace function public.billing_expire_pending(p_hours int default 24) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  update public.payments set status = 'failed', settled_at = now()
  where status = 'pending' and created_at < now() - make_interval(hours => p_hours);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.billing_expire_pending(int) from public, anon, authenticated;
grant execute on function public.billing_expire_pending(int) to service_role;
