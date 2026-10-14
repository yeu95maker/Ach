-- =============================================================================
-- Rentals and richer property data
--   * transaction: sale | rent (price = monthly rent for rentals)
--   * rooms for rent (category 'room'), Zimbabwe-relevant features
--   * rent details, floor, year built, condition, street address (private
--     unless the provider shows the exact location)
--   * search: transaction, move-in date, year built, radius around a point
-- =============================================================================

create type public.transaction_type as enum ('sale', 'rent');
create type public.property_condition as enum ('new', 'renovated', 'good', 'needs_renovation');
alter type public.property_category add value if not exists 'room';
alter type public.property_feature add value if not exists 'furnished';
alter type public.property_feature add value if not exists 'lift';
alter type public.property_feature add value if not exists 'pets_allowed';
alter type public.property_feature add value if not exists 'accessible';
alter type public.property_feature add value if not exists 'borehole';
alter type public.property_feature add value if not exists 'solar';
alter type public.property_feature add value if not exists 'backup_power';
alter type public.property_feature add value if not exists 'security';
alter type public.property_feature add value if not exists 'staff_quarters';

alter table public.properties
  add column transaction      public.transaction_type not null default 'sale',
  add column additional_costs numeric(10, 2) check (additional_costs >= 0),
  add column deposit          numeric(12, 2) check (deposit >= 0),
  add column available_from   date,
  add column floor            smallint check (floor between -5 and 200),
  add column year_built       smallint check (year_built between 1850 and 2100),
  add column condition        public.property_condition,
  add column street_address   text check (char_length(street_address) <= 200);

create index properties_transaction_idx on public.properties (transaction, category, published_at desc) where status = 'active';

/** Great-circle distance in km. */
create or replace function private.distance_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable set search_path = '' as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function private.property_matches(p public.properties, f jsonb) returns boolean
language sql stable set search_path = '' as $$
  select
        (f ->> 'transaction'    is null or p.transaction::text = f ->> 'transaction')
    and (f ->> 'category'       is null or p.category::text = f ->> 'category')
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
    and (f ->> 'available_by'   is null or coalesce(p.available_from, current_date) <= (f ->> 'available_by')::date)
    and (f ->> 'min_year_built' is null or p.year_built >= (f ->> 'min_year_built')::int)
    and (f ->> 'provider_id'    is null or p.provider_id = (f ->> 'provider_id')::uuid)
    and (jsonb_typeof(f -> 'features') is distinct from 'array' or not exists (
          select 1 from jsonb_array_elements_text(f -> 'features') as want (feature)
          where not exists (
            select 1 from public.property_features pf
            where pf.property_id = p.id and pf.feature::text = want.feature)))
    and (jsonb_typeof(f -> 'bbox') is distinct from 'array' or (
              p.approx_longitude between (f -> 'bbox' ->> 0)::float8 and (f -> 'bbox' ->> 2)::float8
          and p.approx_latitude  between (f -> 'bbox' ->> 1)::float8 and (f -> 'bbox' ->> 3)::float8))
    -- Radius search: near = [lat, lng], radius_km (box prefilter + haversine on the public position)
    and (jsonb_typeof(f -> 'near') is distinct from 'array' or f ->> 'radius_km' is null or (
              p.approx_latitude between (f -> 'near' ->> 0)::float8 - (f ->> 'radius_km')::float8 / 111.0
                                    and (f -> 'near' ->> 0)::float8 + (f ->> 'radius_km')::float8 / 111.0
          and private.distance_km(p.approx_latitude, p.approx_longitude, (f -> 'near' ->> 0)::float8, (f -> 'near' ->> 1)::float8)
              <= (f ->> 'radius_km')::float8))
$$;

create or replace function private.property_card(p public.properties, p_lock text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'category', p.category,
    'transaction', p.transaction,
    'title', case when p_lock is null then p.title end,
    'country', p.country,
    'city', p.city,
    'area', p.area,
    'lat', p.approx_latitude,
    'lng', p.approx_longitude,
    'price', case when p_lock is null then p.price end,
    'currency', p.currency,
    'additional_costs', case when p_lock is null then p.additional_costs end,
    'available_from', p.available_from,
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
      select jsonb_build_object('id', pr.id, 'name', pr.display_name, 'type', pr.provider_type, 'verified', pr.status = 'verified', 'founding', pr.is_founding)
      from public.providers pr where pr.id = p.provider_id) end,
    'published_at', p.published_at,
    'is_favorite', exists (select 1 from public.favorites f where f.user_id = auth.uid() and f.property_id = p.id)
  )
$$;

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
    'street_address', case when v_lock is null and (p.show_exact_location or v_owner or v_admin) then p.street_address end,
    'deposit', case when v_lock is null then p.deposit end,
    'floor', p.floor,
    'year_built', p.year_built,
    'condition', p.condition,
    'last_confirmed_at', p.last_confirmed_at,
    'provider', case when v_lock is null then jsonb_build_object(
      'id', v_provider.id,
      'name', v_provider.display_name,
      'type', v_provider.provider_type,
      'verified', v_provider.status = 'verified',
      'founding', v_provider.is_founding,
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
      transaction = coalesce((p_property ->> 'transaction')::public.transaction_type, 'sale'),
      additional_costs = (p_property ->> 'additional_costs')::numeric,
      deposit = (p_property ->> 'deposit')::numeric,
      available_from = (p_property ->> 'available_from')::date,
      floor = (p_property ->> 'floor')::smallint,
      year_built = (p_property ->> 'year_built')::smallint,
      condition = (p_property ->> 'condition')::public.property_condition,
      street_address = nullif(btrim(p_property ->> 'street_address'), ''),
      status = v_status
    where id = v_id;
  else
    insert into public.properties (id, provider_id, category, title, description, country, city, area, latitude, longitude,
      show_exact_location, price, currency, land_size_m2, living_area_m2, bedrooms, bathrooms, parking_spaces, status,
      transaction, additional_costs, deposit, available_from, floor, year_built, condition, street_address)
    values (v_id, v_provider, (p_property ->> 'category')::public.property_category, btrim(p_property ->> 'title'),
      coalesce(btrim(p_property ->> 'description'), ''), btrim(p_property ->> 'country'), btrim(p_property ->> 'city'),
      btrim(p_property ->> 'area'), (p_property ->> 'latitude')::float8, (p_property ->> 'longitude')::float8,
      coalesce((p_property ->> 'show_exact_location')::boolean, false), (p_property ->> 'price')::numeric,
      coalesce(p_property ->> 'currency', 'USD'), (p_property ->> 'land_size_m2')::numeric,
      (p_property ->> 'living_area_m2')::numeric, (p_property ->> 'bedrooms')::smallint,
      (p_property ->> 'bathrooms')::smallint, (p_property ->> 'parking_spaces')::smallint,
      case when p_submit then 'pending'::public.property_status else 'draft'::public.property_status end,
      coalesce((p_property ->> 'transaction')::public.transaction_type, 'sale'), (p_property ->> 'additional_costs')::numeric,
      (p_property ->> 'deposit')::numeric, (p_property ->> 'available_from')::date, (p_property ->> 'floor')::smallint,
      (p_property ->> 'year_built')::smallint, (p_property ->> 'condition')::public.property_condition,
      nullif(btrim(p_property ->> 'street_address'), ''));
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

create or replace function public.provider_dashboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'category', p.category, 'transaction', p.transaction, 'area', p.area, 'city', p.city,
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

create or replace function private.conversation_json(c public.conversations) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'role', case when c.customer_id = auth.uid() then 'customer' else 'provider' end,
    'property', (select jsonb_build_object('id', p.id, 'title', p.title, 'price', p.price, 'currency', p.currency, 'transaction', p.transaction,
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

grant execute on all functions in schema private to anon, authenticated, service_role;
