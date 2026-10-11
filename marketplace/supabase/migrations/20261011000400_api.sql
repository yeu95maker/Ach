-- =============================================================================
-- Public API (RPC). Every function is security definer with an empty
-- search_path and checks the caller itself.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Listing projections
-- ---------------------------------------------------------------------------
create or replace function private.cover_image(p_property uuid) returns text
language sql stable security definer set search_path = '' as $$
  select i.storage_path from public.property_images i
  where i.property_id = p_property order by i.position, i.created_at limit 1
$$;

create or replace function private.property_features_json(p_property uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(f.feature order by f.feature), '[]') from public.property_features f where f.property_id = p_property
$$;

/** Card for lists, maps and favorites. Locked listings lose price, title and provider. */
create or replace function private.property_card(p public.properties, p_lock text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'category', p.category,
    'title', case when p_lock is null then p.title end,
    'country', p.country,
    'city', p.city,
    'area', p.area,
    'lat', p.approx_latitude,
    'lng', p.approx_longitude,
    'price', case when p_lock is null then p.price end,
    'currency', p.currency,
    'land_size_m2', p.land_size_m2,
    'living_area_m2', p.living_area_m2,
    'bedrooms', p.bedrooms,
    'bathrooms', p.bathrooms,
    'parking_spaces', p.parking_spaces,
    'features', private.property_features_json(p.id),
    'cover_image', private.cover_image(p.id),
    'image_count', (select count(*) from public.property_images i where i.property_id = p.id),
    'is_premium', p.is_premium,
    'early_access_until', p.early_access_until,
    'locked', p_lock is not null,
    'lock_reason', p_lock,
    'provider', case when p_lock is null then (
      select jsonb_build_object('id', pr.id, 'name', pr.display_name, 'type', pr.provider_type, 'verified', pr.status = 'verified')
      from public.providers pr where pr.id = p.provider_id) end,
    'published_at', p.published_at,
    'is_favorite', exists (select 1 from public.favorites f where f.user_id = auth.uid() and f.property_id = p.id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
/**
 * p_filters: see src/lib/filters.ts (category, country, city, area, min/max_price,
 * min/max_size, min_bedrooms, min_bathrooms, bbox [w,s,e,n], provider_id, sort;
 * premium: features[], min_living_area, min_parking, max_age_days).
 * Returns { total, items: [card…] }.
 *
 * Locked listings are left out whenever a price filter is set, so their price
 * cannot be narrowed down by repeated searches; with price sorting they come last.
 */
create or replace function public.search_properties(p_filters jsonb default '{}', p_limit int default 24, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := coalesce(p_filters, '{}');
  v_full boolean := private.is_premium() or private.is_admin();
  v_price_filter boolean := f ->> 'min_price' is not null or f ->> 'max_price' is not null;
  v_sort text := coalesce(f ->> 'sort', 'newest');
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_items jsonb;
begin
  if not v_full and private.uses_advanced_filters(f) then
    raise exception 'PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  with visible as (
    select p as prop, private.lock_reason(p, v_full) as lock
    from public.properties p
    join public.providers pr on pr.id = p.provider_id
    where p.status = 'active' and pr.status = 'verified'
      and private.property_matches(p, f)
  ), allowed as (
    select * from visible where lock is null or not v_price_filter
  ), page as (
    select a.*,
           row_number() over (order by
             case when v_sort in ('price_asc', 'price_desc') then (a.lock is not null) end,
             case when v_sort = 'price_asc'  then (a.prop).price end asc,
             case when v_sort = 'price_desc' then (a.prop).price end desc,
             case when v_sort = 'size_desc'  then coalesce((a.prop).land_size_m2, (a.prop).living_area_m2) end desc nulls last,
             (a.prop).published_at desc,
             (a.prop).id) as rn,
           count(*) over () as total
    from allowed a
  )
  select coalesce(max(total), 0)::int,
         coalesce(jsonb_agg(private.property_card(prop, lock) order by rn) filter (where rn > v_offset and rn <= v_offset + v_limit), '[]')
    into v_total, v_items
  from page;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

/** Distinct areas with active listings (for the "Where?" suggestions). */
create or replace function public.list_locations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('country', country, 'city', city, 'area', area, 'count', n) order by n desc, area), '[]')
  from (
    select p.country, p.city, p.area, count(*) as n
    from public.properties p join public.providers pr on pr.id = p.provider_id
    where p.status = 'active' and pr.status = 'verified'
    group by 1, 2, 3
  ) s
$$;

-- ---------------------------------------------------------------------------
-- Property page
-- ---------------------------------------------------------------------------
create or replace function public.get_property(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.properties;
  v_provider public.providers;
  v_admin boolean := private.is_admin();
  v_owner boolean;
  v_lock text;
  v_card jsonb;
begin
  select * into p from public.properties where id = p_id;
  if not found then return null; end if;
  select * into v_provider from public.providers where id = p.provider_id;
  v_owner := coalesce(v_provider.owner_id = auth.uid(), false);

  if not (v_owner or v_admin or (p.status = 'active' and v_provider.status = 'verified')) then
    return null;
  end if;

  v_lock := private.lock_reason(p, private.is_premium() or v_admin);
  v_card := private.property_card(p, v_lock);

  return v_card || jsonb_build_object(
    'status', p.status,
    'description', case when v_lock is null then p.description end,
    'images', (
      select coalesce(jsonb_agg(i.storage_path order by i.position, i.created_at), '[]')
      from (select * from public.property_images x where x.property_id = p.id
            order by x.position, x.created_at limit case when v_lock is null then 100 else 1 end) i),
    'nearby', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'name', n.name, 'distance_m', n.distance_m) order by n.distance_m), '[]')
      from public.property_nearby n where n.property_id = p.id),
    'show_exact_location', p.show_exact_location,
    'last_confirmed_at', p.last_confirmed_at,
    'provider', case when v_lock is null then jsonb_build_object(
      'id', v_provider.id,
      'name', v_provider.display_name,
      'type', v_provider.provider_type,
      'verified', v_provider.status = 'verified',
      'city', v_provider.city,
      'country', v_provider.country,
      'member_since', v_provider.created_at,
      'active_count', (select count(*) from public.properties x where x.provider_id = v_provider.id and x.status = 'active')
    ) end,
    'is_owner', v_owner,
    'conversation_id', (select c.id from public.conversations c where c.property_id = p.id and c.customer_id = auth.uid())
  );
end;
$$;

/** Counts at most one view per property, viewer and day; owners don't count. */
create or replace function public.record_property_view(p_id uuid, p_viewer_key text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text := coalesce(auth.uid()::text, left(p_viewer_key, 80));
  v_rows int;
begin
  if v_key is null or char_length(v_key) < 8 or not private.is_listed(p_id) or private.owns_property(p_id) then
    return;
  end if;
  insert into public.property_view_events (property_id, viewer_key) values (p_id, v_key) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    update public.properties set view_count = view_count + 1 where id = p_id;
  end if;
end;
$$;

create or replace function public.get_provider_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pr.id,
    'name', pr.display_name,
    'type', pr.provider_type,
    'verified', pr.status = 'verified',
    'city', pr.city,
    'country', pr.country,
    'about', pr.about,
    'logo_path', pr.logo_path,
    'member_since', pr.created_at,
    'active_count', (select count(*) from public.properties x where x.provider_id = pr.id and x.status = 'active')
  )
  from public.providers pr
  where pr.id = p_id and (pr.status = 'verified' or pr.owner_id = auth.uid() or private.is_admin())
$$;

-- ---------------------------------------------------------------------------
-- Account
-- ---------------------------------------------------------------------------
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
        'payment_provider', m.payment_provider)
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

create or replace function public.list_favorites() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.property_card(p, private.lock_reason(p, private.is_premium() or private.is_admin())) order by f.created_at desc), '[]')
  from public.favorites f
  join public.properties p on p.id = f.property_id
  join public.providers pr on pr.id = p.provider_id
  where f.user_id = auth.uid() and p.status = 'active' and pr.status = 'verified'
$$;

-- ---------------------------------------------------------------------------
-- Providers
-- ---------------------------------------------------------------------------
create or replace function public.submit_provider_verification(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_provider public.providers;
  v_id uuid;
begin
  select * into v_provider from public.providers where owner_id = auth.uid();
  if not found then raise exception 'NO_PROVIDER' using errcode = '22023'; end if;
  if v_provider.status in ('verified', 'suspended', 'pending') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(array(select jsonb_array_elements_text(p -> 'document_paths')), '{}')) d(path)
             where split_part(d.path, '/', 1) <> auth.uid()::text) then
    raise exception 'INVALID_DOCUMENT' using errcode = '42501';
  end if;

  insert into public.provider_verifications (
    provider_id, legal_name, contact_phone, contact_email, id_document_type, id_document_number,
    business_name, business_registration_number, agent_license_number, document_paths)
  values (
    v_provider.id, btrim(p ->> 'legal_name'), btrim(p ->> 'contact_phone'), btrim(p ->> 'contact_email'),
    p ->> 'id_document_type', btrim(p ->> 'id_document_number'),
    nullif(btrim(p ->> 'business_name'), ''), nullif(btrim(p ->> 'business_registration_number'), ''),
    nullif(btrim(p ->> 'agent_license_number'), ''),
    coalesce(array(select jsonb_array_elements_text(p -> 'document_paths')), '{}'))
  returning id into v_id;

  update public.providers set status = 'pending', status_note = null where id = v_provider.id;
  return v_id;
end;
$$;

create or replace function public.provider_dashboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'category', p.category, 'area', p.area, 'city', p.city,
    'price', p.price, 'currency', p.currency, 'status', p.status, 'moderation_note', p.moderation_note,
    'is_premium', p.is_premium, 'early_access_until', p.early_access_until,
    'views', p.view_count,
    'inquiries', (select count(*) from public.conversations c where c.property_id = p.id),
    'favorites', (select count(*) from public.favorites f where f.property_id = p.id),
    'cover_image', private.cover_image(p.id),
    'published_at', p.published_at, 'last_confirmed_at', p.last_confirmed_at, 'updated_at', p.updated_at
  ) order by p.created_at desc), '[]')
  from public.properties p
  where p.provider_id = private.my_provider_id() and p.status <> 'removed'
$$;

create or replace function public.confirm_property_available(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.owns_property(p_id) then raise exception 'NOT_OWNER' using errcode = '42501'; end if;
  update public.properties set last_confirmed_at = now() where id = p_id and status = 'active';
end;
$$;

/** Cron (service role): ask providers to confirm listings unconfirmed for 30 days. */
create or replace function public.request_availability_confirmations(p_days int default 30) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select pr.owner_id, 'confirm_availability', p.title, '', '/provider'
  from public.properties p join public.providers pr on pr.id = p.provider_id
  where p.status = 'active' and p.last_confirmed_at < now() - make_interval(days => p_days)
    and not exists (select 1 from public.notifications n
                    where n.user_id = pr.owner_id and n.kind = 'confirm_availability' and n.title = p.title
                      and n.created_at > now() - make_interval(days => p_days));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.request_availability_confirmations(int) from public, anon, authenticated;
grant execute on function public.request_availability_confirmations(int) to service_role;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.start_conversation(p_property_id uuid, p_message text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.properties;
  v_owner uuid;
  v_id uuid;
  v_new boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.is_suspended() then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if not private.is_listed(p_property_id) then raise exception 'NOT_FOUND' using errcode = '22023'; end if;

  select * into p from public.properties where id = p_property_id;
  select owner_id into v_owner from public.providers where id = p.provider_id;
  if v_owner = auth.uid() then raise exception 'OWN_PROPERTY' using errcode = '22023'; end if;
  if private.lock_reason(p, private.is_premium() or private.is_admin()) is not null then
    raise exception 'PREMIUM_REQUIRED' using errcode = 'P0001';
  end if;

  select id into v_id from public.conversations where property_id = p.id and customer_id = auth.uid();
  if v_id is null then
    insert into public.conversations (property_id, customer_id, provider_id)
    values (p.id, auth.uid(), p.provider_id)
    on conflict (property_id, customer_id) do nothing
    returning id into v_id;
    v_new := v_id is not null;
    if v_id is null then
      select id into v_id from public.conversations where property_id = p.id and customer_id = auth.uid();
    end if;
  end if;

  if nullif(btrim(p_message), '') is not null then
    insert into public.messages (conversation_id, sender_id, body) values (v_id, auth.uid(), btrim(p_message));
  end if;
  if v_new then
    perform private.notify(v_owner, 'new_inquiry', p.title, coalesce(left(btrim(p_message), 200), ''), '/messages/' || v_id);
  end if;
  return v_id;
end;
$$;

create or replace function private.conversation_json(c public.conversations) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'role', case when c.customer_id = auth.uid() then 'customer' else 'provider' end,
    'property', (select jsonb_build_object('id', p.id, 'title', p.title, 'price', p.price, 'currency', p.currency,
                   'area', p.area, 'city', p.city, 'category', p.category, 'status', p.status,
                   'cover_image', private.cover_image(p.id))
                 from public.properties p where p.id = c.property_id),
    'provider', (select jsonb_build_object('id', pr.id, 'name', pr.display_name, 'verified', pr.status = 'verified')
                 from public.providers pr where pr.id = c.provider_id),
    'customer_name', (select coalesce(nullif(pf.full_name, ''), 'Customer') from public.profiles pf where pf.id = c.customer_id),
    'last_message', (select jsonb_build_object('body', left(m.body, 160), 'created_at', m.created_at, 'mine', m.sender_id = auth.uid())
                     from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    'last_message_at', c.last_message_at,
    'unread', case when c.customer_id = auth.uid() then c.last_message_at > c.customer_last_read_at
                   else c.last_message_at > c.provider_last_read_at end
  )
$$;

create or replace function public.list_conversations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.conversation_json(c) order by c.last_message_at desc), '[]')
  from public.conversations c
  where c.customer_id = auth.uid() or c.provider_id = private.my_provider_id()
$$;

create or replace function public.get_conversation(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.conversation_json(c) from public.conversations c
  where c.id = p_id and (c.customer_id = auth.uid() or c.provider_id = private.my_provider_id())
$$;

create or replace function public.mark_conversation_read(p_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.conversations c
     set customer_last_read_at = case when c.customer_id = auth.uid() then now() else c.customer_last_read_at end,
         provider_last_read_at = case when c.provider_id = private.my_provider_id() then now() else c.provider_last_read_at end
   where c.id = p_id and (c.customer_id = auth.uid() or c.provider_id = private.my_provider_id())
$$;

-- ---------------------------------------------------------------------------
-- Billing (payment-provider agnostic)
-- ---------------------------------------------------------------------------
/** Extends (or starts) premium by one billing period and books the payment. */
create or replace function private.apply_payment(
  p_user uuid, p_interval public.billing_interval, p_provider text, p_reference text,
  p_amount numeric, p_currency text, p_external_customer text default null, p_external_subscription text default null)
returns public.memberships
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_m public.memberships;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_m from public.memberships where user_id = p_user for update;
  v_start := case when found and v_m.status in ('active', 'canceled', 'past_due') and v_m.current_period_end > now()
                  then v_m.current_period_end else now() end;
  v_end := v_start + case when p_interval = 'year' then interval '1 year' else interval '1 month' end;

  insert into public.payments (user_id, amount, currency, status, payment_provider, external_reference, billing_interval, period_start, period_end)
  values (p_user, p_amount, p_currency, 'succeeded', p_provider, p_reference, p_interval, v_start, v_end);

  insert into public.memberships (user_id, status, billing_interval, current_period_start, current_period_end,
                                  cancel_at_period_end, payment_provider, external_customer_id, external_subscription_id)
  values (p_user, 'active', p_interval, v_start, v_end, false, p_provider, p_external_customer, p_external_subscription)
  on conflict (user_id) do update set
    status = 'active', billing_interval = excluded.billing_interval,
    current_period_start = case when public.memberships.current_period_end > now() then public.memberships.current_period_start else excluded.current_period_start end,
    current_period_end = excluded.current_period_end, cancel_at_period_end = false,
    payment_provider = excluded.payment_provider,
    external_customer_id = coalesce(excluded.external_customer_id, public.memberships.external_customer_id),
    external_subscription_id = coalesce(excluded.external_subscription_id, public.memberships.external_subscription_id)
  returning * into v_m;

  perform private.notify(p_user, 'membership', 'premium_active', to_char(v_end, 'YYYY-MM-DD'), '/membership');
  return v_m;
end;
$$;

/** Payment webhooks (server side, service role only). Idempotent per provider reference. */
create or replace function public.billing_record_payment(
  p_user uuid, p_interval public.billing_interval, p_provider text, p_reference text,
  p_amount numeric, p_currency text, p_external_customer text default null, p_external_subscription text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if exists (select 1 from public.payments where payment_provider = p_provider and external_reference = p_reference) then
    return jsonb_build_object('duplicate', true);
  end if;
  return to_jsonb(private.apply_payment(p_user, p_interval, p_provider, p_reference, p_amount, p_currency, p_external_customer, p_external_subscription));
end;
$$;
revoke execute on function public.billing_record_payment(uuid, public.billing_interval, text, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_record_payment(uuid, public.billing_interval, text, text, numeric, text, text, text) to service_role;

/** Payment failed / subscription ended at the provider (service role only). */
create or replace function public.billing_mark_status(p_user uuid, p_status public.membership_status) returns void
language sql volatile security definer set search_path = '' as $$
  update public.memberships set status = p_status where user_id = p_user
$$;
revoke execute on function public.billing_mark_status(uuid, public.membership_status) from public, anon, authenticated;
grant execute on function public.billing_mark_status(uuid, public.membership_status) to service_role;

/** Demo checkout: only when app_settings.demo_billing is on (development / staging). */
create or replace function public.billing_demo_checkout(p_interval public.billing_interval) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.app_settings;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into s from public.app_settings;
  if not s.demo_billing then raise exception 'DEMO_BILLING_DISABLED' using errcode = '42501'; end if;
  return to_jsonb(private.apply_payment(
    auth.uid(), p_interval, 'demo', 'demo-' || gen_random_uuid(),
    case when p_interval = 'year' then s.premium_price_year else s.premium_price_month end, s.currency));
end;
$$;

/** Cancel at period end: premium stays until current_period_end, then expires. */
create or replace function public.cancel_membership() returns void
language sql volatile security definer set search_path = '' as $$
  update public.memberships set cancel_at_period_end = true, status = 'canceled'
  where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.resume_membership() returns void
language sql volatile security definer set search_path = '' as $$
  update public.memberships set cancel_at_period_end = false, status = 'active'
  where user_id = auth.uid() and status = 'canceled' and current_period_end > now()
$$;

/** Cron (service role): flag memberships whose period has ended. */
create or replace function public.expire_memberships() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  update public.memberships set status = 'expired'
  where status in ('active', 'canceled', 'past_due') and current_period_end <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.expire_memberships() from public, anon, authenticated;
grant execute on function public.expire_memberships() to service_role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_ONLY' using errcode = '42501'; end if;
end;
$$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'providers_verified', (select count(*) from public.providers where status = 'verified'),
    'providers_pending', (select count(*) from public.providers where status = 'pending'),
    'properties_active', (select count(*) from public.properties where status = 'active'),
    'properties_pending', (select count(*) from public.properties where status = 'pending'),
    'properties_new_7d', (select count(*) from public.properties where published_at > now() - interval '7 days'),
    'premium_members', (select count(*) from public.memberships where status in ('active', 'canceled') and current_period_end > now()),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'properties_removed', (select count(*) from public.properties where status = 'removed'),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.payments where status = 'succeeded' and created_at > now() - interval '30 days'),
    'revenue_total', (select coalesce(sum(amount), 0) from public.payments where status = 'succeeded'),
    'views_total', (select coalesce(sum(view_count), 0) from public.properties),
    'favorites_total', (select count(*) from public.favorites),
    'conversations_total', (select count(*) from public.conversations),
    'share_with_inquiry', (select round(100.0 * count(*) filter (where exists (select 1 from public.conversations c where c.property_id = p.id))
                                         / nullif(count(*), 0), 1)
                           from public.properties p where p.status = 'active'),
    'avg_inquiries', (select round(avg((select count(*) from public.conversations c where c.property_id = p.id)), 2)
                      from public.properties p where p.status = 'active'),
    'median_hours_to_first_inquiry', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (fc.first_at - p.published_at)) / 3600))::numeric, 1)
      from public.properties p
      join lateral (select min(c.created_at) as first_at from public.conversations c where c.property_id = p.id) fc on fc.first_at is not null
      where p.published_at is not null),
    'currency', (select currency from public.app_settings)
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_review_provider(p_provider_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_owner uuid;
begin
  perform private.require_admin();
  update public.providers
     set status = case when p_approve then 'verified'::public.provider_status else 'rejected'::public.provider_status end,
         status_note = nullif(btrim(p_note), ''),
         verified_at = case when p_approve then now() else null end
   where id = p_provider_id and status in ('pending', 'rejected', 'unverified')
  returning owner_id into v_owner;
  if v_owner is null then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;

  update public.provider_verifications
     set status = case when p_approve then 'approved'::public.verification_status else 'rejected'::public.verification_status end,
         reviewer_id = auth.uid(), review_note = nullif(btrim(p_note), ''), reviewed_at = now()
   where provider_id = p_provider_id and status = 'pending';

  perform private.notify(v_owner, case when p_approve then 'provider_verified' else 'provider_rejected' end, '', coalesce(p_note, ''), '/provider');
end;
$$;

/** Suspend hides all listings of the provider immediately (they are filtered by provider status). */
create or replace function public.admin_set_provider_suspended(p_provider_id uuid, p_suspended boolean, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_owner uuid;
begin
  perform private.require_admin();
  update public.providers
     set status = case when p_suspended then 'suspended'::public.provider_status
                       when verified_at is not null then 'verified'::public.provider_status
                       else 'unverified'::public.provider_status end,
         status_note = nullif(btrim(p_note), '')
   where id = p_provider_id
  returning owner_id into v_owner;
  if v_owner is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if p_suspended then
    perform private.notify(v_owner, 'provider_suspended', '', coalesce(p_note, ''), '/provider');
  end if;
end;
$$;

/** p_action: approve | reject | remove | restore. Approve may start premium early access. */
create or replace function public.admin_moderate_property(p_id uuid, p_action text, p_note text default null, p_early_access boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.properties;
  v_owner uuid;
  v_hours int := (select early_access_hours from public.app_settings);
begin
  perform private.require_admin();
  select * into p from public.properties where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  select owner_id into v_owner from public.providers where id = p.provider_id;

  if p_action = 'approve' and p.status in ('pending', 'rejected') then
    update public.properties
       set status = 'active', moderation_note = null,
           early_access_until = case when p_early_access then now() + make_interval(hours => v_hours) else null end
     where id = p_id;
    perform private.notify(v_owner, 'property_approved', p.title, '', '/properties/' || p_id);
  elsif p_action = 'reject' and p.status in ('pending', 'active') then
    update public.properties set status = 'rejected', moderation_note = nullif(btrim(p_note), '') where id = p_id;
    perform private.notify(v_owner, 'property_rejected', p.title, coalesce(p_note, ''), '/provider');
  elsif p_action = 'remove' and p.status <> 'removed' then
    update public.properties set status = 'removed', moderation_note = nullif(btrim(p_note), '') where id = p_id;
    perform private.notify(v_owner, 'property_removed', p.title, coalesce(p_note, ''), '/provider');
  elsif p_action = 'restore' and p.status = 'removed' then
    update public.properties set status = 'active', moderation_note = null where id = p_id;
  else
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.admin_set_property_access(p_id uuid, p_is_premium boolean, p_early_access_hours int default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.properties
     set is_premium = p_is_premium,
         early_access_until = case when coalesce(p_early_access_hours, 0) > 0
                                   then now() + make_interval(hours => least(p_early_access_hours, 720)) else null end
   where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
end;
$$;

create or replace function public.admin_resolve_report(p_id uuid, p_status public.report_status, p_note text default null, p_remove_property boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_property uuid;
begin
  perform private.require_admin();
  if p_status = 'open' then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  update public.reports set status = p_status, resolution_note = nullif(btrim(p_note), ''), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id returning property_id into v_property;
  if v_property is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if p_remove_property and exists (select 1 from public.properties where id = v_property and status <> 'removed') then
    perform public.admin_moderate_property(v_property, 'remove', p_note);
    -- Close other open reports about the same listing.
    update public.reports set status = 'resolved', resolution_note = nullif(btrim(p_note), ''), resolved_by = auth.uid(), resolved_at = now()
     where property_id = v_property and status = 'open';
  end if;
end;
$$;

create or replace function public.admin_list_users(p_query text default null, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(row order by created_at desc), '[]') into v from (
    select jsonb_build_object(
      'id', pf.id, 'email', u.email, 'full_name', pf.full_name, 'is_admin', pf.is_admin, 'is_suspended', pf.is_suspended,
      'created_at', pf.created_at, 'is_premium', private.is_premium(pf.id),
      'membership', (select jsonb_build_object('status', m.status, 'current_period_end', m.current_period_end, 'payment_provider', m.payment_provider)
                     from public.memberships m where m.user_id = pf.id),
      'provider', (select jsonb_build_object('id', pr.id, 'display_name', pr.display_name, 'status', pr.status)
                   from public.providers pr where pr.owner_id = pf.id)
    ) as row, pf.created_at
    from public.profiles pf join auth.users u on u.id = pf.id
    where p_query is null or btrim(p_query) = ''
       or u.email ilike '%' || btrim(p_query) || '%' or pf.full_name ilike '%' || btrim(p_query) || '%'
    order by pf.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) s;
  return v;
end;
$$;

create or replace function public.admin_set_user_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then raise exception 'CANNOT_SUSPEND_SELF' using errcode = '22023'; end if;
  update public.profiles set is_suspended = p_suspended where id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
end;
$$;

/** Complimentary premium (p_months > 0) or immediate revocation (p_months = 0). */
create or replace function public.admin_set_membership(p_user uuid, p_months int) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if coalesce(p_months, 0) <= 0 then
    update public.memberships set status = 'expired', current_period_end = now(), cancel_at_period_end = false where user_id = p_user;
    return;
  end if;
  insert into public.memberships (user_id, status, billing_interval, current_period_start, current_period_end, payment_provider)
  values (p_user, 'active', 'month', now(), now() + make_interval(months => least(p_months, 36)), 'manual')
  on conflict (user_id) do update set status = 'active', cancel_at_period_end = false, payment_provider = 'manual',
    current_period_start = now(), current_period_end = now() + make_interval(months => least(p_months, 36));
end;
$$;

-- Admin lists that need joins not covered by RLS-scoped table reads
create or replace function public.admin_list_providers(p_status public.provider_status default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'display_name', pr.display_name, 'provider_type', pr.provider_type, 'status', pr.status,
      'status_note', pr.status_note, 'city', pr.city, 'country', pr.country, 'created_at', pr.created_at,
      'verified_at', pr.verified_at, 'owner_email', u.email,
      'active_count', (select count(*) from public.properties p where p.provider_id = pr.id and p.status = 'active'),
      'verification', (select to_jsonb(pv) - 'provider_id' from public.provider_verifications pv
                       where pv.provider_id = pr.id order by pv.created_at desc limit 1)
    ) order by (pr.status = 'pending') desc, pr.created_at desc), '[]') into v
  from public.providers pr join auth.users u on u.id = pr.owner_id
  where p_status is null or pr.status = p_status;
  return v;
end;
$$;

create or replace function public.admin_list_properties(p_status public.property_status default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(private.property_card(p, null) || jsonb_build_object(
      'status', p.status, 'submitted_at', p.submitted_at, 'moderation_note', p.moderation_note,
      'description', p.description, 'views', p.view_count,
      'provider_status', pr.status,
      'open_reports', (select count(*) from public.reports r where r.property_id = p.id and r.status = 'open'))
    order by coalesce(p.submitted_at, p.created_at) desc), '[]') into v
  from public.properties p join public.providers pr on pr.id = p.provider_id
  where (p_status is null and p.status <> 'draft') or p.status = p_status;
  return v;
end;
$$;

create or replace function public.admin_list_reports(p_status public.report_status default 'open') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at,
      'resolution_note', r.resolution_note, 'reporter_email', u.email,
      'property', jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status, 'area', p.area, 'city', p.city,
                                     'provider_id', p.provider_id,
                                     'provider_name', (select display_name from public.providers pr where pr.id = p.provider_id))
    ) order by r.created_at desc), '[]') into v
  from public.reports r
  join public.properties p on p.id = r.property_id
  join auth.users u on u.id = r.reporter_id
  where p_status is null or r.status = p_status;
  return v;
end;
$$;

-- Lock down: helpers & cron-only functions above were revoked individually.
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Listing wizard: create / update a listing with its features, photos and
-- nearby places in one transaction. Runs as the caller (security invoker), so
-- RLS and the guard triggers decide exactly as for direct table writes.
--   p_property: columns of public.properties (id optional for new listings)
--   p_submit:   true → submit for moderation (or keep an active listing live)
-- ---------------------------------------------------------------------------
create or replace function public.save_property(
  p_property jsonb, p_features public.property_feature[], p_images text[], p_nearby jsonb, p_submit boolean)
returns uuid language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_id uuid := coalesce((p_property ->> 'id')::uuid, gen_random_uuid());
  v_existing public.properties;
  v_status public.property_status;
  v_provider uuid := private.my_provider_id();
begin
  if v_provider is null then raise exception 'NO_PROVIDER' using errcode = '22023'; end if;
  if cardinality(coalesce(p_images, '{}')) > 30 then raise exception 'TOO_MANY_IMAGES' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_images, '{}')) i(path)
             where split_part(i.path, '/', 1) <> v_provider::text) then
    raise exception 'INVALID_IMAGE' using errcode = '42501';
  end if;

  select * into v_existing from public.properties where id = v_id;
  if found then
    v_status := case
      when v_existing.status = 'active' then 'active'
      when p_submit then 'pending'
      when v_existing.status = 'pending' then 'pending'
      else 'draft' end;
    update public.properties set
      category = (p_property ->> 'category')::public.property_category,
      title = btrim(p_property ->> 'title'),
      description = coalesce(btrim(p_property ->> 'description'), ''),
      country = btrim(p_property ->> 'country'),
      city = btrim(p_property ->> 'city'),
      area = btrim(p_property ->> 'area'),
      latitude = (p_property ->> 'latitude')::float8,
      longitude = (p_property ->> 'longitude')::float8,
      show_exact_location = coalesce((p_property ->> 'show_exact_location')::boolean, false),
      price = (p_property ->> 'price')::numeric,
      currency = coalesce(p_property ->> 'currency', 'USD'),
      land_size_m2 = (p_property ->> 'land_size_m2')::numeric,
      living_area_m2 = (p_property ->> 'living_area_m2')::numeric,
      bedrooms = (p_property ->> 'bedrooms')::smallint,
      bathrooms = (p_property ->> 'bathrooms')::smallint,
      parking_spaces = (p_property ->> 'parking_spaces')::smallint,
      status = v_status
    where id = v_id;
  else
    insert into public.properties (id, provider_id, category, title, description, country, city, area, latitude, longitude,
      show_exact_location, price, currency, land_size_m2, living_area_m2, bedrooms, bathrooms, parking_spaces, status)
    values (v_id, v_provider, (p_property ->> 'category')::public.property_category, btrim(p_property ->> 'title'),
      coalesce(btrim(p_property ->> 'description'), ''), btrim(p_property ->> 'country'), btrim(p_property ->> 'city'),
      btrim(p_property ->> 'area'), (p_property ->> 'latitude')::float8, (p_property ->> 'longitude')::float8,
      coalesce((p_property ->> 'show_exact_location')::boolean, false), (p_property ->> 'price')::numeric,
      coalesce(p_property ->> 'currency', 'USD'), (p_property ->> 'land_size_m2')::numeric,
      (p_property ->> 'living_area_m2')::numeric, (p_property ->> 'bedrooms')::smallint,
      (p_property ->> 'bathrooms')::smallint, (p_property ->> 'parking_spaces')::smallint,
      case when p_submit then 'pending'::public.property_status else 'draft'::public.property_status end);
  end if;

  delete from public.property_features where property_id = v_id;
  insert into public.property_features (property_id, feature)
  select distinct v_id, f from unnest(coalesce(p_features, '{}')) f;

  delete from public.property_images where property_id = v_id;
  insert into public.property_images (property_id, storage_path, position)
  select v_id, path, (ord - 1)::smallint from unnest(coalesce(p_images, '{}')) with ordinality i(path, ord);

  delete from public.property_nearby where property_id = v_id;
  insert into public.property_nearby (property_id, kind, name, distance_m)
  select v_id, (n ->> 'kind')::public.nearby_kind, btrim(n ->> 'name'), (n ->> 'distance_m')::int
  from jsonb_array_elements(coalesce(p_nearby, '[]')) n
  where nullif(btrim(n ->> 'name'), '') is not null;

  return v_id;
end;
$$;

/** Owner view of one listing for the edit wizard (exact location included). */
create or replace function public.get_my_property(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(p) || jsonb_build_object(
    'features', (select coalesce(jsonb_agg(f.feature), '[]') from public.property_features f where f.property_id = p.id),
    'images', (select coalesce(jsonb_agg(i.storage_path order by i.position, i.created_at), '[]') from public.property_images i where i.property_id = p.id),
    'nearby', (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'name', n.name, 'distance_m', n.distance_m) order by n.distance_m), '[]')
               from public.property_nearby n where n.property_id = p.id))
  from public.properties p where p.id = p_id
$$;
