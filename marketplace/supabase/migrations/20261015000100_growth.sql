-- =============================================================================
-- Growth: Founding Provider badge, partner referral codes (field agents who
-- bring in providers), plus the admin functions to manage and pay them.
-- =============================================================================

alter table public.providers
  add column is_founding boolean not null default false,
  add column referral_code text check (char_length(referral_code) <= 40);

create table public.partners (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
  name       text not null check (char_length(name) between 2 and 120),
  contact    text check (char_length(contact) <= 200),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;
revoke all on public.partners from anon;
create policy partners_admin on public.partners for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create index providers_referral_idx on public.providers (referral_code) where referral_code is not null;

/** Normalised code if it belongs to an active partner, else null (partners are not readable by users). */
create or replace function private.valid_partner_code(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select p.code from public.partners p where p.code = upper(btrim(p_code)) and p.active
$$;

/** Founding status is set by admins; the referral code only once, when the provider profile is created. */
create or replace function private.guard_provider_growth() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.is_founding := false;
      new.referral_code := private.valid_partner_code(new.referral_code);
    else
      new.is_founding := old.is_founding;
      new.referral_code := old.referral_code;
    end if;
  end if;
  return new;
end;
$$;
create trigger providers_growth_guard before insert or update on public.providers
  for each row execute function private.guard_provider_growth();

grant execute on all functions in schema private to anon, authenticated, service_role;

-- Provider objects now carry `founding` -----------------------------------------
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

create or replace function public.get_provider_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pr.id,
    'name', pr.display_name,
    'type', pr.provider_type,
    'verified', pr.status = 'verified',
    'founding', pr.is_founding,
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

create or replace function public.admin_list_providers(p_status public.provider_status default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'display_name', pr.display_name, 'provider_type', pr.provider_type, 'status', pr.status,
      'status_note', pr.status_note, 'city', pr.city, 'country', pr.country, 'created_at', pr.created_at,
      'verified_at', pr.verified_at, 'owner_email', u.email,
      'is_founding', pr.is_founding, 'referral_code', pr.referral_code,
      'active_count', (select count(*) from public.properties p where p.provider_id = pr.id and p.status = 'active'),
      'verification', (select to_jsonb(pv) - 'provider_id' from public.provider_verifications pv
                       where pv.provider_id = pr.id order by pv.created_at desc limit 1)
    ) order by (pr.status = 'pending') desc, pr.created_at desc), '[]') into v
  from public.providers pr join auth.users u on u.id = pr.owner_id
  where p_status is null or pr.status = p_status;
  return v;
end;
$$;

-- Admin ------------------------------------------------------------------------
create or replace function public.admin_set_founding(p_provider_id uuid, p_founding boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.providers set is_founding = p_founding where id = p_provider_id;
  if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
end;
$$;

create or replace function public.admin_save_partner(p_code text, p_name text, p_contact text default null, p_active boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  insert into public.partners (code, name, contact, active)
  values (upper(btrim(p_code)), btrim(p_name), nullif(btrim(p_contact), ''), p_active)
  on conflict (code) do update set name = excluded.name, contact = excluded.contact, active = excluded.active;
end;
$$;

/**
 * Partners with their results. A provider "qualifies" (e.g. for the partner's
 * bonus) once verified with at least p_min_listings active listings.
 */
create or replace function public.admin_list_partners(p_min_listings int default 5) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pa.id, 'code', pa.code, 'name', pa.name, 'contact', pa.contact, 'active', pa.active, 'created_at', pa.created_at,
      'providers', s.providers, 'verified', s.verified, 'qualified', s.qualified, 'active_listings', s.listings,
      'provider_list', s.list
    ) order by pa.created_at), '[]') into v
  from public.partners pa
  cross join lateral (
    select count(*) as providers,
           count(*) filter (where pr.status = 'verified') as verified,
           count(*) filter (where pr.status = 'verified' and x.n >= p_min_listings) as qualified,
           coalesce(sum(x.n), 0) as listings,
           coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.display_name, 'status', pr.status, 'active_listings', x.n,
                                                 'created_at', pr.created_at) order by pr.created_at) filter (where pr.id is not null), '[]') as list
    from public.providers pr
    cross join lateral (select count(*) as n from public.properties p where p.provider_id = pr.id and p.status = 'active') x
    where pr.referral_code = pa.code
  ) s;
  return v;
end;
$$;
