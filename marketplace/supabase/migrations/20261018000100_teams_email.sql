-- =============================================================================
-- Agency teams and email notifications
--   * providers can have team members (admin / agent) besides the owner;
--     members act for the provider everywhere (listings, photos, inbox)
--   * email outbox: notifications and new messages are queued here and sent by
--     the app's cron worker (src/app/api/cron/emails) – a slow email provider
--     never slows down the site, failed sends are retried
-- =============================================================================

create type public.provider_role as enum ('owner', 'admin', 'agent');

create table public.provider_members (
  provider_id uuid not null references public.providers (id) on delete cascade,
  user_id     uuid not null unique references public.profiles (id) on delete cascade,
  role        public.provider_role not null default 'agent' check (role <> 'owner'),
  created_at  timestamptz not null default now(),
  primary key (provider_id, user_id)
);

create table public.provider_invites (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  email       text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  role        public.provider_role not null default 'agent' check (role <> 'owner'),
  token       text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);
create index provider_invites_provider_idx on public.provider_invites (provider_id) where accepted_at is null;

alter table public.profiles add column email_notifications boolean not null default true;

/** The provider the caller belongs to – as owner or as team member. */
create or replace function private.my_provider_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select pr.id from public.providers pr where pr.owner_id = auth.uid()),
    (select m.provider_id from public.provider_members m where m.user_id = auth.uid()))
$$;

create or replace function private.my_provider_role() returns public.provider_role
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.providers pr where pr.owner_id = auth.uid()) then 'owner'::public.provider_role
              else (select m.role from public.provider_members m where m.user_id = auth.uid()) end
$$;

/** Owner and all members of a provider. */
create or replace function private.provider_team(p_provider uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array(select owner_id from public.providers where id = p_provider
               union select user_id from public.provider_members where provider_id = p_provider)
$$;

create or replace function private.owns_property(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.properties p where p.id = p_property and p.provider_id = private.my_provider_id())
$$;

create or replace function private.is_conversation_participant(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation and (c.customer_id = auth.uid() or c.provider_id = private.my_provider_id()))
$$;

-- Team members see their (possibly not yet verified) provider.
drop policy providers_public on public.providers;
create policy providers_public on public.providers for select to anon, authenticated
  using (status = 'verified' or id = private.my_provider_id() or private.is_admin());

alter table public.provider_members enable row level security;
alter table public.provider_invites enable row level security;
revoke all on public.provider_members, public.provider_invites from anon;
revoke insert, update, delete on public.provider_members, public.provider_invites from authenticated;
create policy provider_members_read on public.provider_members for select to authenticated
  using (provider_id = private.my_provider_id() or private.is_admin());
create policy provider_invites_read on public.provider_invites for select to authenticated
  using ((provider_id = private.my_provider_id() and private.my_provider_role() in ('owner', 'admin')) or private.is_admin());

-- ---------------------------------------------------------------------------
-- Email outbox
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade,
  to_email   text check (to_email ~ '^[^@\s]+@[^@\s]+$'),
  kind       text not null check (char_length(kind) <= 40),
  params     jsonb not null default '{}',
  link       text check (char_length(link) <= 300),
  status     text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts   int not null default 0,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  check (user_id is not null or to_email is not null)
);
create index email_outbox_pending_idx on public.email_outbox (created_at) where status in ('pending', 'failed');
create index email_outbox_recent_idx on public.email_outbox (user_id, kind, created_at desc);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

/** In-app notifications that also go out by email (if the user has not switched emails off). */
create or replace function private.notification_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'membership' and coalesce((select email_notifications from public.profiles where id = new.user_id), false) then
    insert into public.email_outbox (user_id, kind, params, link)
    values (new.user_id, new.kind, jsonb_build_object('title', new.title, 'body', new.body), new.link);
  end if;
  return null;
end;
$$;
create trigger notifications_email after insert on public.notifications for each row execute function private.notification_email();

/** Worker (service role): take a batch to send, with recipient address and language. */
create or replace function public.email_outbox_claim(p_limit int default 50) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb;
begin
  with batch as (
    select o.id from public.email_outbox o
    where o.status = 'pending' or (o.status in ('failed', 'sending') and o.attempts < 3 and o.created_at < now() - interval '10 minutes')
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), claimed as (
    update public.email_outbox o set status = 'sending', attempts = o.attempts + 1
    from batch where o.id = batch.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'params', c.params, 'link', c.link,
      'to', coalesce(c.to_email, u.email), 'name', coalesce(pf.full_name, ''), 'locale', coalesce(pf.locale, 'en'))), '[]') into v
  from claimed c
  left join auth.users u on u.id = c.user_id
  left join public.profiles pf on pf.id = c.user_id;
  return v;
end;
$$;

create or replace function public.email_outbox_mark(p_id uuid, p_ok boolean, p_error text default null) returns void
language sql volatile security definer set search_path = '' as $$
  update public.email_outbox
     set status = case when p_ok then 'sent' else 'failed' end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 500) end
   where id = p_id
$$;

do $$
declare f text;
begin
  foreach f in array array['public.email_outbox_claim(int)', 'public.email_outbox_mark(uuid, boolean, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Team management
-- ---------------------------------------------------------------------------
create or replace function private.require_team_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.my_provider_id();
begin
  if v is null or private.my_provider_role() not in ('owner', 'admin') then
    raise exception 'TEAM_ADMIN_ONLY' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public.team_invite(p_email text, p_role public.provider_role default 'agent') returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_provider uuid := private.require_team_admin();
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  if p_role = 'owner' then raise exception 'INVALID_ROLE' using errcode = '22023'; end if;
  if exists (select 1 from auth.users u
             where lower(u.email) = v_email and u.id = any(private.provider_team(v_provider))) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  delete from public.provider_invites where provider_id = v_provider and email = v_email and accepted_at is null;
  insert into public.provider_invites (provider_id, email, role, invited_by)
  values (v_provider, v_email, p_role, auth.uid()) returning token into v_token;
  insert into public.email_outbox (to_email, kind, params, link)
  values (v_email, 'team_invite',
          jsonb_build_object('provider', (select display_name from public.providers where id = v_provider),
                             'from', (select coalesce(nullif(full_name, ''), '') from public.profiles where id = auth.uid())),
          '/provider/join?token=' || v_token);
  return v_token;
end;
$$;

create or replace function public.team_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_provider uuid := private.my_provider_id();
  v jsonb;
begin
  if v_provider is null then raise exception 'NO_PROVIDER' using errcode = '22023'; end if;
  select jsonb_build_object(
    'my_role', private.my_provider_role(),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', x.uid, 'role', x.role, 'email', u.email,
                                                             'name', pf.full_name, 'since', x.since) order by x.role, x.since), '[]')
                from (select owner_id as uid, 'owner'::public.provider_role as role, created_at as since from public.providers where id = v_provider
                      union all select user_id, role, created_at from public.provider_members where provider_id = v_provider) x
                join auth.users u on u.id = x.uid left join public.profiles pf on pf.id = x.uid),
    'invites', case when private.my_provider_role() in ('owner', 'admin') then
                 (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'token', i.token, 'created_at', i.created_at)
                                            order by i.created_at desc), '[]')
                  from public.provider_invites i where i.provider_id = v_provider and i.accepted_at is null)
               else '[]'::jsonb end
  ) into v;
  return v;
end;
$$;

create or replace function public.team_remove(p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_provider uuid := private.require_team_admin();
begin
  delete from public.provider_members where provider_id = v_provider and user_id = p_user;
  if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
end;
$$;

create or replace function public.team_revoke_invite(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_provider uuid := private.require_team_admin();
begin
  delete from public.provider_invites where id = p_id and provider_id = v_provider and accepted_at is null;
end;
$$;

/** Join a provider with an invitation sent to the signed-in user's email address. */
create or replace function public.accept_provider_invite(p_token text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  i public.provider_invites;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into i from public.provider_invites where token = p_token and accepted_at is null
    and created_at > now() - interval '14 days';
  if not found then raise exception 'INVITE_INVALID' using errcode = '22023'; end if;
  if lower((select email from auth.users where id = auth.uid())) <> i.email then
    raise exception 'INVITE_OTHER_EMAIL' using errcode = '42501';
  end if;
  if private.my_provider_id() is not null then raise exception 'ALREADY_PROVIDER' using errcode = '23505'; end if;
  insert into public.provider_members (provider_id, user_id, role) values (i.provider_id, auth.uid(), i.role);
  update public.provider_invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  return i.provider_id;
end;
$$;

-- Functions that now follow team membership instead of "owner only" -------------------
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

  -- Email the other side – at most once per conversation and recipient every 30 minutes,
  -- and not for the very first message (the "new inquiry" email covers it).
  if v_conv.created_at < now() - interval '1 minute' then
    insert into public.email_outbox (user_id, kind, params, link)
    select r, 'new_message',
           jsonb_build_object('title', (select title from public.properties where id = v_conv.property_id),
                              'from', (select coalesce(nullif(full_name, ''), '') from public.profiles where id = new.sender_id),
                              'body', left(new.body, 300)),
           '/messages/' || v_conv.id
    from unnest(case when v_is_customer then private.provider_team(v_conv.provider_id) else array[v_conv.customer_id] end) r
    where r <> new.sender_id
      and coalesce((select email_notifications from public.profiles where id = r), false)
      and not exists (select 1 from public.email_outbox o where o.user_id = r and o.kind = 'new_message'
                        and o.link = '/messages/' || v_conv.id and o.created_at > now() - interval '30 minutes');
  end if;
  return null;
end;
$$;

create or replace function private.guard_property() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_provider public.providers;
begin
  -- Admins (direct edits from the admin dashboard) are trusted like admin RPCs.
  if private.is_api_caller() and not private.is_admin() then
    select * into v_provider from public.providers where id = new.provider_id;
    if new.provider_id is distinct from private.my_provider_id() then
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
  v_owner := coalesce(p.provider_id = private.my_provider_id(), false);

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
  where pr.id = p_id and (pr.status = 'verified' or pr.id = private.my_provider_id() or private.is_admin())
$$;

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
  if p.provider_id = private.my_provider_id() then raise exception 'OWN_PROPERTY' using errcode = '22023'; end if;
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
    perform private.notify(m, 'new_inquiry', p.title, coalesce(left(btrim(p_message), 200), ''), '/messages/' || v_id)
    from unnest(private.provider_team(p.provider_id)) m;
  end if;
  return v_id;
end;
$$;

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
        'provider_type', p.provider_type, 'status_note', p.status_note, 'role', private.my_provider_role())
      from public.providers p where p.id = private.my_provider_id()),
    'email_notifications', pr.email_notifications,
    'favorites_count', (select count(*) from public.favorites f where f.user_id = auth.uid()),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null),
    'unread_messages', (
      select count(*) from public.conversations c
      where (c.customer_id = auth.uid() and c.last_message_at > c.customer_last_read_at)
         or (c.provider_id = private.my_provider_id() and c.last_message_at > c.provider_last_read_at))
  ) end
  from public.profiles pr where pr.id = auth.uid()
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;
