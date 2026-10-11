-- =============================================================================
-- Helpers and integrity triggers
--
-- Convention: API callers run as `anon` / `authenticated`. Security-definer
-- functions run as the migration owner, so triggers treat every other role as
-- trusted (admin RPCs, payment webhooks via service_role, seeds).
-- =============================================================================

create or replace function private.is_api_caller() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('anon', 'authenticated')
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin and not p.is_suspended from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function private.is_suspended() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_suspended from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function private.is_premium(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user
      and m.status in ('active', 'canceled')
      and m.current_period_end > now()
  )
$$;

create or replace function private.my_provider_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select pr.id from public.providers pr where pr.owner_id = auth.uid()
$$;

create or replace function private.owns_property(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.properties p join public.providers pr on pr.id = p.provider_id
    where p.id = p_property and pr.owner_id = auth.uid()
  )
$$;

create or replace function private.is_conversation_participant(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    left join public.providers pr on pr.id = c.provider_id
    where c.id = p_conversation and (c.customer_id = auth.uid() or pr.owner_id = auth.uid())
  )
$$;

/** Is the listing public at all (active, provider verified)? */
create or replace function private.is_listed(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.properties p join public.providers pr on pr.id = p.provider_id
    where p.id = p_property and p.status = 'active' and pr.status = 'verified'
  )
$$;

/**
 * Why (if at all) the caller sees only a teaser of a listing.
 * p_full_access: caller is premium or admin (computed once per query).
 */
create or replace function private.lock_reason(p public.properties, p_full_access boolean) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_full_access then null
    when p.provider_id is not distinct from private.my_provider_id() then null
    when p.is_premium then 'members_only'
    when p.early_access_until is not null and p.early_access_until > now() then 'early_access'
    else null
  end
$$;

/**
 * Single source of truth for search filters (used by search and by saved-search
 * alerts). Size = plot size, or living area where there is no plot (apartments).
 */
create or replace function private.property_matches(p public.properties, f jsonb) returns boolean
language sql stable set search_path = '' as $$
  select
        (f ->> 'category'       is null or p.category::text = f ->> 'category')
    and (f ->> 'country'        is null or lower(p.country) = lower(f ->> 'country'))
    and (f ->> 'city'           is null or lower(p.city) = lower(f ->> 'city'))
    and (f ->> 'area'           is null or lower(p.area) = lower(f ->> 'area'))
    and (f ->> 'min_price'      is null or p.price >= (f ->> 'min_price')::numeric)
    and (f ->> 'max_price'      is null or p.price <= (f ->> 'max_price')::numeric)
    and (f ->> 'min_size'       is null or coalesce(p.land_size_m2, p.living_area_m2) >= (f ->> 'min_size')::numeric)
    and (f ->> 'max_size'       is null or coalesce(p.land_size_m2, p.living_area_m2) <= (f ->> 'max_size')::numeric)
    and (f ->> 'min_bedrooms'   is null or p.bedrooms  >= (f ->> 'min_bedrooms')::int)
    and (f ->> 'min_bathrooms'  is null or p.bathrooms >= (f ->> 'min_bathrooms')::int)
    and (f ->> 'min_living_area' is null or p.living_area_m2 >= (f ->> 'min_living_area')::numeric)
    and (f ->> 'min_parking'    is null or p.parking_spaces >= (f ->> 'min_parking')::int)
    and (f ->> 'max_age_days'   is null or p.published_at >= now() - make_interval(days => (f ->> 'max_age_days')::int))
    and (f ->> 'provider_id'    is null or p.provider_id = (f ->> 'provider_id')::uuid)
    and (jsonb_typeof(f -> 'features') is distinct from 'array' or not exists (
          select 1 from jsonb_array_elements_text(f -> 'features') as want (feature)
          where not exists (
            select 1 from public.property_features pf
            where pf.property_id = p.id and pf.feature::text = want.feature)))
    and (jsonb_typeof(f -> 'bbox') is distinct from 'array' or (
              p.approx_longitude between (f -> 'bbox' ->> 0)::float8 and (f -> 'bbox' ->> 2)::float8
          and p.approx_latitude  between (f -> 'bbox' ->> 1)::float8 and (f -> 'bbox' ->> 3)::float8))
$$;

/** Filters only premium members may use (keep in sync with src/lib/filters.ts). */
create or replace function private.uses_advanced_filters(f jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select f ->> 'min_living_area' is not null
      or f ->> 'min_parking' is not null
      or f ->> 'max_age_days' is not null
      or (jsonb_typeof(f -> 'features') = 'array' and jsonb_array_length(f -> 'features') > 0)
$$;

create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, coalesce(p_body, ''), p_link)
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch   before update on public.profiles   for each row execute function private.touch_updated_at();
create trigger providers_touch  before update on public.providers  for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.memberships for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: created with the auth user; flags only changeable by trusted code
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    case when new.raw_user_meta_data ->> 'locale' in ('en', 'de') then new.raw_user_meta_data ->> 'locale' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() then
    new.id := old.id;
    new.is_admin := old.is_admin;
    new.is_suspended := old.is_suspended;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile();

-- ---------------------------------------------------------------------------
-- Providers: verification status is decided by admins only
-- ---------------------------------------------------------------------------
create or replace function private.guard_provider() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() and not (tg_op = 'UPDATE' and private.is_admin()) then
    if tg_op = 'INSERT' then
      if private.is_suspended() then
        raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
      end if;
      new.owner_id := auth.uid();
      new.status := 'unverified';
      new.status_note := null;
      new.verified_at := null;
    else
      new.id := old.id;
      new.owner_id := old.owner_id;
      new.status := old.status;
      new.status_note := old.status_note;
      new.verified_at := old.verified_at;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger providers_guard before insert or update on public.providers for each row execute function private.guard_provider();

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
/** Public position: snapped to a ~550 m grid plus a stable per-listing offset. */
create or replace function private.approximate(p_value double precision, p_seed text, p_salt text) returns double precision
language sql immutable set search_path = '' as $$
  select round(p_value * 200) / 200.0
       + ((abs(hashtext(p_seed || p_salt)) % 1000) / 1000.0 - 0.5) * 0.004
$$;

create or replace function private.guard_property() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_provider public.providers;
begin
  -- Admins (direct edits from the admin dashboard) are trusted like admin RPCs.
  if private.is_api_caller() and not private.is_admin() then
    select * into v_provider from public.providers where id = new.provider_id;
    if v_provider.owner_id is distinct from auth.uid() then
      raise exception 'NOT_OWNER' using errcode = '42501';
    end if;
    if private.is_suspended() or v_provider.status = 'suspended' then
      raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') then
        raise exception 'INVALID_STATUS' using errcode = '22023';
      end if;
      new.is_premium := false;
      new.early_access_until := null;
      new.view_count := 0;
      new.published_at := null;
      new.last_confirmed_at := null;
      new.moderation_note := null;
      new.created_at := now();
    else
      new.id := old.id;
      new.provider_id := old.provider_id;
      new.is_premium := old.is_premium;
      new.early_access_until := old.early_access_until;
      new.view_count := old.view_count;
      new.published_at := old.published_at;
      new.last_confirmed_at := old.last_confirmed_at;
      new.moderation_note := old.moderation_note;
      new.submitted_at := old.submitted_at;
      new.created_at := old.created_at;
      -- Allowed owner transitions; going live is a moderation decision.
      if new.status <> old.status and not (
           (old.status in ('draft', 'rejected') and new.status = 'pending')
        or (old.status = 'pending' and new.status = 'draft')
        or (old.status = 'active' and new.status in ('sold', 'removed'))
        or (old.status in ('draft', 'pending', 'rejected') and new.status = 'removed')
      ) then
        raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
      end if;
    end if;

    if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
      if v_provider.status <> 'verified' then
        raise exception 'PROVIDER_NOT_VERIFIED' using errcode = '42501';
      end if;
      new.submitted_at := now();
    end if;
  end if;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    new.published_at := coalesce(new.published_at, now());
    new.last_confirmed_at := now();
  end if;

  if new.show_exact_location then
    new.approx_latitude := new.latitude;
    new.approx_longitude := new.longitude;
  else
    new.approx_latitude := private.approximate(new.latitude, new.id::text, 'lat');
    new.approx_longitude := private.approximate(new.longitude, new.id::text, 'lng');
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger properties_guard before insert or update on public.properties for each row execute function private.guard_property();

/** Alerts: saved searches on publish, favorites on price drop / no longer available. */
create or replace function private.property_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_search record;
  v_link text := '/properties/' || new.id;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    for v_search in
      select s.id, s.user_id, s.name from public.saved_searches s
      where s.alerts_enabled
        and private.is_premium(s.user_id)
        and private.property_matches(new, s.filters)
        and s.user_id is distinct from (select pr.owner_id from public.providers pr where pr.id = new.provider_id)
    loop
      perform private.notify(v_search.user_id, 'saved_search_match', new.title, v_search.name, v_link);
      update public.saved_searches set last_notified_at = now() where id = v_search.id;
    end loop;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' then
    if new.status = 'active' and new.price < old.price then
      insert into public.notifications (user_id, kind, title, body, link)
      select f.user_id, 'favorite_price_drop', new.title, new.currency || ' ' || to_char(new.price, 'FM999,999,999,990'), v_link
      from public.favorites f where f.property_id = new.id;
    elsif new.status in ('sold', 'removed') then
      insert into public.notifications (user_id, kind, title, body, link)
      select f.user_id, 'favorite_unavailable', new.title, new.status::text, v_link
      from public.favorites f where f.property_id = new.id;
    end if;
  end if;
  return null;
end;
$$;
create trigger properties_events after insert or update of status, price on public.properties
  for each row execute function private.property_events();

-- Child rows (images, features, nearby) of a listing: only its provider may change them.
create or replace function private.guard_property_child() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() and private.is_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger property_images_guard   before insert or update or delete on public.property_images   for each row execute function private.guard_property_child();
create trigger property_features_guard before insert or update or delete on public.property_features for each row execute function private.guard_property_child();
create trigger property_nearby_guard   before insert or update or delete on public.property_nearby   for each row execute function private.guard_property_child();

-- ---------------------------------------------------------------------------
-- Favorites: free accounts have a limit
-- ---------------------------------------------------------------------------
create or replace function private.guard_favorite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := (select free_favorites_limit from public.app_settings);
begin
  if not private.is_listed(new.property_id) then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;
  if not private.is_premium(new.user_id)
     and (select count(*) from public.favorites f where f.user_id = new.user_id) >= v_limit then
    raise exception 'FAVORITES_LIMIT' using errcode = 'P0001', hint = v_limit::text;
  end if;
  return new;
end;
$$;
create trigger favorites_guard before insert on public.favorites for each row execute function private.guard_favorite();

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function private.on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations;
  v_is_customer boolean;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  v_is_customer := new.sender_id = v_conv.customer_id;
  update public.conversations
     set last_message_at = new.created_at,
         customer_last_read_at = case when v_is_customer then new.created_at else customer_last_read_at end,
         provider_last_read_at = case when v_is_customer then provider_last_read_at else new.created_at end
   where id = new.conversation_id;
  return null;
end;
$$;
create trigger messages_after_insert after insert on public.messages for each row execute function private.on_message();

create or replace function private.guard_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() then
    new.sender_id := auth.uid();
    new.created_at := now();
    new.body := btrim(new.body);
    if private.is_suspended() then
      raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger messages_guard before insert on public.messages for each row execute function private.guard_message();

-- ---------------------------------------------------------------------------
-- Saved searches: premium feature
-- ---------------------------------------------------------------------------
create or replace function private.guard_saved_search() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() then
    if not private.is_premium() then
      raise exception 'PREMIUM_REQUIRED' using errcode = 'P0001';
    end if;
    new.user_id := auth.uid();
    if tg_op = 'UPDATE' then
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger saved_searches_guard before insert or update on public.saved_searches for each row execute function private.guard_saved_search();

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function private.guard_report() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() then
    new.reporter_id := auth.uid();
    new.status := 'open';
    new.resolution_note := null;
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_at := now();
    if exists (select 1 from public.reports r
               where r.reporter_id = new.reporter_id and r.property_id = new.property_id and r.status = 'open') then
      raise exception 'ALREADY_REPORTED' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;
create trigger reports_guard before insert on public.reports for each row execute function private.guard_report();

-- Notifications: users may only mark them as read.
create or replace function private.guard_notification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() then
    new.id := old.id; new.user_id := old.user_id; new.kind := old.kind; new.title := old.title;
    new.body := old.body; new.link := old.link; new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications for each row execute function private.guard_notification();

grant execute on all functions in schema private to anon, authenticated, service_role;
