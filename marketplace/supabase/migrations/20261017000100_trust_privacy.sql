-- =============================================================================
-- Trust, privacy and provider tools
--   * listing risk flags for moderation (scam prevention)
--   * immutable audit log of admin changes
--   * GDPR: data export, account deletion keeps anonymised payment records
--   * providers can pause / resume a live listing
-- =============================================================================

alter type public.property_status add value if not exists 'paused';

-- ---------------------------------------------------------------------------
-- Risk flags: cheap signals that put suspicious listings first in the queue
-- ---------------------------------------------------------------------------
create or replace function private.listing_risk(p public.properties) returns jsonb
language sql stable security definer set search_path = '' as $$
  with pr as (select * from public.providers where id = p.provider_id),
  median as (
    select percentile_cont(0.5) within group (order by x.price) as m, count(*) as n
    from public.properties x
    where x.status = 'active' and x.id <> p.id and x.category = p.category and x.transaction = p.transaction and lower(x.city) = lower(p.city)
  ),
  flags as (
    select 'new_provider' as flag, 2 as weight
      where (select coalesce(verified_at, created_at) from pr) > now() - interval '7 days'
    union all
    select 'duplicate_description', 3 where char_length(p.description) >= 40 and exists (
      select 1 from public.properties x where x.id <> p.id and x.provider_id <> p.provider_id
        and x.status not in ('removed') and md5(lower(btrim(x.description))) = md5(lower(btrim(p.description))))
    union all
    select 'duplicate_title_area', 2 where exists (
      select 1 from public.properties x where x.id <> p.id and x.provider_id <> p.provider_id
        and x.status not in ('removed') and lower(x.title) = lower(p.title) and lower(x.area) = lower(p.area))
    union all
    select 'price_far_below_market', 3 from median where median.n >= 3 and p.price < 0.4 * median.m
    union all
    select 'open_reports', 3 where exists (select 1 from public.reports r where r.property_id = p.id and r.status = 'open')
    union all
    select 'few_photos', 1 where (select count(*) from public.property_images i where i.property_id = p.id) < 2
    union all
    select 'provider_had_removals', 2 where (
      select count(*) from public.properties x where x.provider_id = p.provider_id and x.status = 'removed' and x.moderation_note is not null) >= 2
  )
  select jsonb_build_object(
    'score', coalesce(sum(weight), 0),
    'level', case when coalesce(sum(weight), 0) >= 5 then 'high' when coalesce(sum(weight), 0) >= 2 then 'medium' else 'low' end,
    'flags', coalesce(jsonb_agg(flag order by weight desc), '[]'))
  from flags
$$;

-- ---------------------------------------------------------------------------
-- Audit log: every change an admin makes is recorded and cannot be altered
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (private.is_admin());

create or replace function private.audit_admin_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if auth.uid() is not null and private.is_admin() and v_before is distinct from v_after then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after, ip)
    values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_after ->> 'id', v_before ->> 'id', v_after ->> 'user_id', v_before ->> 'user_id'),
            v_before, v_after,
            split_part(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ''), ',', 1));
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['properties', 'providers', 'reports', 'memberships', 'profiles', 'partners', 'app_settings', 'provider_verifications'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_admin_change()', t || '_audit', t);
  end loop;
end $$;

create or replace function public.admin_list_audit(p_limit int default 100, p_entity_type text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id, 'created_at', a.created_at,
      'ip', a.ip, 'actor_email', u.email,
      'changes', (select coalesce(jsonb_object_agg(k, jsonb_build_object('from', a.before -> k, 'to', a.after -> k)), '{}')
                  from jsonb_object_keys(coalesce(a.after, a.before)) k
                  where k not in ('updated_at', 'approx_latitude', 'approx_longitude')
                    and (a.before -> k) is distinct from (a.after -> k))
    ) order by a.id desc), '[]') into v
  from (select * from public.audit_logs x where p_entity_type is null or x.entity_type = p_entity_type
        order by x.id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) a
  left join auth.users u on u.id = a.actor_id;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacy (GDPR): export and deletion
-- ---------------------------------------------------------------------------
-- Accounting records must outlive the account: keep payments, drop the link to the person.
alter table public.payments alter column user_id drop not null;
alter table public.payments drop constraint payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;

/** Everything stored about the signed-in user (Art. 15/20 GDPR). */
create or replace function public.my_data_export() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'membership', (select to_jsonb(m) - 'external_customer_id' - 'external_subscription_id' from public.memberships m where m.user_id = auth.uid()),
    'payments', (select coalesce(jsonb_agg(to_jsonb(x) - 'poll_url'), '[]') from public.payments x where x.user_id = auth.uid()),
    'favorites', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.favorites f where f.user_id = auth.uid()),
    'saved_searches', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.saved_searches s where s.user_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from public.notifications n where n.user_id = auth.uid()),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r) - 'resolved_by'), '[]') from public.reports r where r.reporter_id = auth.uid()),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id, 'body', m.body, 'created_at', m.created_at)), '[]')
                      from public.messages m where m.sender_id = auth.uid()),
    'conversations', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'property_id', c.property_id, 'created_at', c.created_at)), '[]')
                      from public.conversations c where c.customer_id = auth.uid() or c.provider_id = private.my_provider_id()),
    'provider', (select to_jsonb(p) from public.providers p where p.owner_id = auth.uid()),
    'provider_verifications', (select coalesce(jsonb_agg(to_jsonb(v) - 'reviewer_id'), '[]') from public.provider_verifications v
                               where v.provider_id = private.my_provider_id()),
    'properties', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.properties p where p.provider_id = private.my_provider_id())
  ) end
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
        or (old.status = 'active' and new.status in ('sold', 'removed', 'paused'))
        or (old.status = 'paused' and new.status in ('active', 'sold', 'removed'))
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
  -- Photos must be in the provider's own folder, or already belong to one of the provider's listings (duplicates).
  if exists (select 1 from unnest(coalesce(p_images, '{}')) i(path)
             where split_part(i.path, '/', 1) <> v_provider::text
               and not exists (select 1 from public.property_images pi join public.properties pp on pp.id = pi.property_id
                               where pi.storage_path = i.path and pp.provider_id = v_provider)) then
    raise exception 'INVALID_IMAGE' using errcode = '42501';
  end if;

  select * into v_existing from public.properties where id = v_id;
  if found then
    v_status := case
      when v_existing.status in ('active', 'paused') then v_existing.status
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

create or replace function public.admin_list_properties(p_status public.property_status default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(private.property_card(p, null) || jsonb_build_object(
      'status', p.status, 'submitted_at', p.submitted_at, 'moderation_note', p.moderation_note,
      'description', p.description, 'views', p.view_count,
      'provider_status', pr.status,
      'open_reports', (select count(*) from public.reports r where r.property_id = p.id and r.status = 'open'),
      'risk', private.listing_risk(p))
    order by (private.listing_risk(p) ->> 'score')::int desc, coalesce(p.submitted_at, p.created_at) desc), '[]') into v
  from public.properties p join public.providers pr on pr.id = p.provider_id
  where (p_status is null and p.status <> 'draft') or p.status = p_status;
  return v;
end;
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;
