-- =============================================================================
-- Managed owners: admins list properties on behalf of owners who have no account
--   * an admin creates a provider profile for the owner ("managed": no owner_id
--     yet, managed_by = the admin) with contact details and verification papers
--   * the admin "acts as" that owner: my_provider_id() then returns the managed
--     provider, so the normal listing wizard, photo upload, import and dashboard
--     work unchanged
--   * buyer inquiries reach the admins' inbox; the owner gets an email with a
--     claim link, and after signing up takes the profile over with all listings
-- =============================================================================

alter table public.providers alter column owner_id drop not null;
alter table public.providers
  add column managed_by    uuid references public.profiles (id),
  add column contact_name  text check (char_length(contact_name) <= 120),
  add column contact_email text check (contact_email ~ '^[^@\s]+@[^@\s]+$'),
  add column contact_phone text check (char_length(contact_phone) <= 40),
  add column claim_token   text unique,
  add column claimed_at    timestamptz,
  add constraint providers_owner_or_manager check (owner_id is not null or managed_by is not null);

-- Owners listed by an admin may have no email address.
alter table public.provider_verifications alter column contact_email drop not null;

alter table public.profiles add column acting_provider_id uuid references public.providers (id) on delete set null;

-- Only trusted code changes these columns ---------------------------------------
create or replace function private.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() then
    new.id := old.id;
    new.is_admin := old.is_admin;
    new.is_suspended := old.is_suspended;
    new.created_at := old.created_at;
    new.acting_provider_id := old.acting_provider_id;
  end if;
  return new;
end;
$$;

create or replace function private.guard_provider_managed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_api_caller() and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.managed_by := null;
      new.claim_token := null;
      new.claimed_at := null;
    else
      new.managed_by := old.managed_by;
      new.claim_token := old.claim_token;
      new.claimed_at := old.claimed_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger providers_managed_guard before insert or update on public.providers
  for each row execute function private.guard_provider_managed();

-- Who acts for which provider -----------------------------------------------------
/** The managed (unclaimed) provider an admin is currently acting for. */
create or replace function private.acting_provider_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select pf.acting_provider_id
  from public.profiles pf join public.providers pr on pr.id = pf.acting_provider_id
  where pf.id = auth.uid() and pf.is_admin and pr.owner_id is null
$$;

/** The provider the caller acts for: as acting admin, owner or team member. */
create or replace function private.my_provider_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.acting_provider_id(),
    (select pr.id from public.providers pr where pr.owner_id = auth.uid()),
    (select m.provider_id from public.provider_members m where m.user_id = auth.uid()))
$$;

create or replace function private.my_provider_role() returns public.provider_role
language sql stable security definer set search_path = '' as $$
  select case when private.acting_provider_id() is not null then 'admin'::public.provider_role
              when exists (select 1 from public.providers pr where pr.owner_id = auth.uid()) then 'owner'::public.provider_role
              else (select m.role from public.provider_members m where m.user_id = auth.uid()) end
$$;

/** Everyone who acts for a provider: owner, team members – or, while unclaimed, the managing admin. */
create or replace function private.provider_team(p_provider uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array(select owner_id from public.providers where id = p_provider and owner_id is not null
               union select user_id from public.provider_members where provider_id = p_provider
               union select managed_by from public.providers where id = p_provider and owner_id is null and managed_by is not null)
$$;

/** True if the caller may handle this provider's inbox: their own provider, or any unclaimed one for admins. */
create or replace function private.can_act_for(p_provider uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_provider = private.my_provider_id(), false)
      or (private.is_admin() and exists (select 1 from public.providers where id = p_provider and owner_id is null))
$$;

create or replace function private.is_conversation_participant(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation and (c.customer_id = auth.uid() or private.can_act_for(c.provider_id)))
$$;

/** Notifications for providers without an owner account are dropped (the managing admin gets their own). */
create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, p_title, coalesce(p_body, ''), p_link where p_user is not null
$$;

-- Inbox: admins handle the conversations of all unclaimed owners -------------------
create or replace function public.list_conversations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.conversation_json(c) order by c.last_message_at desc), '[]')
  from public.conversations c
  where c.customer_id = auth.uid() or private.can_act_for(c.provider_id)
$$;

create or replace function public.get_conversation(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.conversation_json(c) from public.conversations c
  where c.id = p_id and (c.customer_id = auth.uid() or private.can_act_for(c.provider_id))
$$;

create or replace function public.mark_conversation_read(p_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.conversations c
     set customer_last_read_at = case when c.customer_id = auth.uid() then now() else c.customer_last_read_at end,
         provider_last_read_at = case when c.customer_id <> auth.uid() and private.can_act_for(c.provider_id) then now() else c.provider_last_read_at end
   where c.id = p_id and (c.customer_id = auth.uid() or private.can_act_for(c.provider_id))
$$;

/** Customer messages to an unclaimed owner: email the owner (at most every 30 minutes per conversation). */
create or replace function private.on_message_managed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations;
  v_provider public.providers;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  if new.sender_id <> v_conv.customer_id then return null; end if;
  select * into v_provider from public.providers where id = v_conv.provider_id;
  if v_provider.owner_id is not null or v_provider.contact_email is null or v_provider.claim_token is null then return null; end if;
  if not exists (select 1 from public.email_outbox o
                 where o.to_email = v_provider.contact_email and o.kind = 'owner_message'
                   and o.params ->> 'conversation' = v_conv.id::text and o.created_at > now() - interval '30 minutes') then
    insert into public.email_outbox (to_email, kind, params, link)
    values (v_provider.contact_email, 'owner_message',
            jsonb_build_object('conversation', v_conv.id, 'provider', v_provider.display_name,
                               'title', (select title from public.properties where id = v_conv.property_id),
                               'body', left(new.body, 300)),
            '/claim?token=' || v_provider.claim_token);
  end if;
  return null;
end;
$$;
create trigger messages_managed_email after insert on public.messages
  for each row execute function private.on_message_managed();

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
        'provider_type', p.provider_type, 'status_note', p.status_note, 'role', private.my_provider_role(),
        'acting', p.id = private.acting_provider_id())
      from public.providers p where p.id = private.my_provider_id()),
    'email_notifications', pr.email_notifications,
    'favorites_count', (select count(*) from public.favorites f where f.user_id = auth.uid()),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null),
    'unread_messages', (
      select count(*) from public.conversations c
      where (c.customer_id = auth.uid() and c.last_message_at > c.customer_last_read_at)
         or (c.customer_id <> auth.uid() and private.can_act_for(c.provider_id) and c.last_message_at > c.provider_last_read_at))
  ) end
  from public.profiles pr where pr.id = auth.uid()
$$;

-- Existing functions that assumed every provider has an owner ------------------------
create or replace function public.request_availability_confirmations(p_days int default 30) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select coalesce(pr.owner_id, pr.managed_by), 'confirm_availability', p.title, '', '/provider'
  from public.properties p join public.providers pr on pr.id = p.provider_id
  where p.status = 'active' and p.last_confirmed_at < now() - make_interval(days => p_days)
    and coalesce(pr.owner_id, pr.managed_by) is not null
    and not exists (select 1 from public.notifications n
                    where n.user_id = coalesce(pr.owner_id, pr.managed_by) and n.kind = 'confirm_availability' and n.title = p.title
                      and n.created_at > now() - make_interval(days => p_days));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.admin_review_provider(p_provider_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  perform private.require_admin();
  update public.providers
     set status = case when p_approve then 'verified'::public.provider_status else 'rejected'::public.provider_status end,
         status_note = nullif(btrim(p_note), ''),
         verified_at = case when p_approve then now() else null end
   where id = p_provider_id and status in ('pending', 'rejected', 'unverified')
  returning id, owner_id into v_id, v_owner;
  if v_id is null then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;

  update public.provider_verifications
     set status = case when p_approve then 'approved'::public.verification_status else 'rejected'::public.verification_status end,
         reviewer_id = auth.uid(), review_note = nullif(btrim(p_note), ''), reviewed_at = now()
   where provider_id = p_provider_id and status = 'pending';

  perform private.notify(v_owner, case when p_approve then 'provider_verified' else 'provider_rejected' end, '', coalesce(p_note, ''), '/provider');
end;
$$;

create or replace function public.admin_set_provider_suspended(p_provider_id uuid, p_suspended boolean, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  perform private.require_admin();
  update public.providers
     set status = case when p_suspended then 'suspended'::public.provider_status
                       when verified_at is not null then 'verified'::public.provider_status
                       else 'unverified'::public.provider_status end,
         status_note = nullif(btrim(p_note), '')
   where id = p_provider_id
  returning id, owner_id into v_id, v_owner;
  if v_id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if p_suspended then
    perform private.notify(v_owner, 'provider_suspended', '', coalesce(p_note, ''), '/provider');
  end if;
end;
$$;

create or replace function public.admin_list_providers(p_status public.provider_status default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'display_name', pr.display_name, 'provider_type', pr.provider_type, 'status', pr.status,
      'status_note', pr.status_note, 'city', pr.city, 'country', pr.country, 'created_at', pr.created_at,
      'verified_at', pr.verified_at, 'owner_email', coalesce(u.email, pr.contact_email),
      'managed', pr.owner_id is null,
      'is_founding', pr.is_founding, 'referral_code', pr.referral_code,
      'active_count', (select count(*) from public.properties p where p.provider_id = pr.id and p.status = 'active'),
      'verification', (select to_jsonb(pv) - 'provider_id' from public.provider_verifications pv
                       where pv.provider_id = pr.id order by pv.created_at desc limit 1)
    ) order by (pr.status = 'pending') desc, pr.created_at desc), '[]') into v
  from public.providers pr left join auth.users u on u.id = pr.owner_id
  where p_status is null or pr.status = p_status;
  return v;
end;
$$;

-- Admin: managed owners --------------------------------------------------------------
/**
 * Create or update an owner profile managed by admins. Created profiles are
 * verified at once: the admin has checked the papers (stored with the profile).
 *   p: { id?, display_name, provider_type, city, country, about,
 *        contact_name, contact_email, contact_phone,
 *        legal_name, id_document_type, id_document_number, document_paths[] }
 * Documents must be uploaded to the admin's own folder in verification-docs.
 */
create or replace function public.admin_save_managed_owner(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_docs text[] := coalesce(array(select jsonb_array_elements_text(p -> 'document_paths')), '{}');
  v_phone text := nullif(btrim(p ->> 'contact_phone'), '');
  v_email text := lower(nullif(btrim(p ->> 'contact_email'), ''));
  v_has_papers boolean := nullif(btrim(p ->> 'id_document_number'), '') is not null or cardinality(v_docs) > 0;
begin
  perform private.require_admin();
  if exists (select 1 from unnest(v_docs) d(path) where split_part(d.path, '/', 1) <> auth.uid()::text) then
    raise exception 'INVALID_DOCUMENT' using errcode = '42501';
  end if;

  if v_id is null then
    if v_phone is null and v_email is null then raise exception 'CONTACT_REQUIRED' using errcode = '22023'; end if;
    if not v_has_papers then raise exception 'VERIFICATION_REQUIRED' using errcode = '22023'; end if;
    insert into public.providers (owner_id, managed_by, display_name, provider_type, city, country, about,
                                  contact_name, contact_email, contact_phone, status, verified_at, claim_token)
    values (null, auth.uid(), btrim(p ->> 'display_name'),
            coalesce((p ->> 'provider_type')::public.provider_type, 'private_seller'),
            coalesce(nullif(btrim(p ->> 'city'), ''), 'Harare'), coalesce(nullif(btrim(p ->> 'country'), ''), 'Zimbabwe'),
            coalesce(btrim(p ->> 'about'), ''),
            nullif(btrim(p ->> 'contact_name'), ''), v_email, v_phone,
            'verified', now(), encode(extensions.gen_random_bytes(18), 'hex'))
    returning id into v_id;
  else
    update public.providers set
      display_name = btrim(p ->> 'display_name'),
      provider_type = coalesce((p ->> 'provider_type')::public.provider_type, provider_type),
      city = coalesce(nullif(btrim(p ->> 'city'), ''), city),
      country = coalesce(nullif(btrim(p ->> 'country'), ''), country),
      about = coalesce(btrim(p ->> 'about'), about),
      contact_name = nullif(btrim(p ->> 'contact_name'), ''),
      contact_email = v_email,
      contact_phone = v_phone
    where id = v_id and owner_id is null;
    if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  end if;

  if v_has_papers then
    insert into public.provider_verifications (provider_id, legal_name, contact_phone, contact_email, id_document_type,
                                               id_document_number, document_paths, status, reviewer_id, reviewed_at, review_note)
    values (v_id, coalesce(nullif(btrim(p ->> 'legal_name'), ''), nullif(btrim(p ->> 'contact_name'), ''), btrim(p ->> 'display_name')),
            coalesce(v_phone, 'not provided'), v_email,
            coalesce(nullif(p ->> 'id_document_type', ''), 'national_id'),
            coalesce(nullif(btrim(p ->> 'id_document_number'), ''), 'see documents'),
            v_docs, 'approved', auth.uid(), now(), 'Checked by admin (managed owner)');
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_list_managed_owners() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'display_name', pr.display_name, 'provider_type', pr.provider_type, 'status', pr.status,
      'city', pr.city, 'country', pr.country, 'about', pr.about,
      'contact_name', pr.contact_name, 'contact_email', pr.contact_email, 'contact_phone', pr.contact_phone,
      'claimed', pr.owner_id is not null, 'claimed_at', pr.claimed_at,
      'claim_token', case when pr.owner_id is null then pr.claim_token end,
      'owner_email', u.email,
      'acting', pr.id = private.acting_provider_id(),
      'created_at', pr.created_at,
      'counts', (select jsonb_build_object(
                   'active', count(*) filter (where p.status = 'active'),
                   'pending', count(*) filter (where p.status = 'pending'),
                   'draft', count(*) filter (where p.status = 'draft'))
                 from public.properties p where p.provider_id = pr.id),
      'documents', (select coalesce(to_jsonb(pv.document_paths), '[]'::jsonb) from public.provider_verifications pv
                    where pv.provider_id = pr.id order by pv.created_at desc limit 1)
    ) order by (pr.owner_id is null) desc, pr.created_at desc), '[]') into v
  from public.providers pr left join auth.users u on u.id = pr.owner_id
  where pr.managed_by is not null;
  return v;
end;
$$;

/** Start (p_provider) or stop (null) acting for an unclaimed owner. */
create or replace function public.admin_act_as(p_provider uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_provider is not null and not exists (select 1 from public.providers where id = p_provider and owner_id is null) then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;
  update public.profiles set acting_provider_id = p_provider where id = auth.uid();
end;
$$;

/** New claim link for an unclaimed owner (old links stop working); optionally emailed to the owner. */
create or replace function public.admin_claim_link(p_provider uuid, p_send_email boolean default false) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.providers;
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  perform private.require_admin();
  update public.providers set claim_token = v_token where id = p_provider and owner_id is null returning * into v;
  if v.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if p_send_email then
    if v.contact_email is null then raise exception 'CONTACT_REQUIRED' using errcode = '22023'; end if;
    insert into public.email_outbox (to_email, kind, params, link)
    values (v.contact_email, 'provider_claim',
            jsonb_build_object('provider', v.display_name,
                               'from', (select coalesce(nullif(full_name, ''), '') from public.profiles where id = auth.uid()),
                               'count', (select count(*) from public.properties p where p.provider_id = v.id and p.status = 'active')),
            '/claim?token=' || v_token);
  end if;
  return v_token;
end;
$$;

-- Owner: claim the profile -------------------------------------------------------------
/** What the claim page shows (also before signing in). */
create or replace function public.get_claim(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'provider', pr.display_name,
    'contact_name', pr.contact_name,
    'listings', (select count(*) from public.properties p where p.provider_id = pr.id and p.status in ('active', 'pending', 'paused')))
  from public.providers pr
  where pr.claim_token = p_token and pr.owner_id is null and char_length(coalesce(p_token, '')) >= 20
$$;

create or replace function public.claim_provider(p_token text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.is_suspended() then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if exists (select 1 from public.providers where owner_id = auth.uid())
     or exists (select 1 from public.provider_members where user_id = auth.uid()) then
    raise exception 'ALREADY_PROVIDER' using errcode = '23505';
  end if;
  update public.providers
     set owner_id = auth.uid(), claimed_at = now(), claim_token = null
   where claim_token = p_token and owner_id is null and char_length(coalesce(p_token, '')) >= 20
  returning id into v_id;
  if v_id is null then raise exception 'CLAIM_INVALID' using errcode = '22023'; end if;
  update public.profiles set acting_provider_id = null where acting_provider_id = v_id;
  return v_id;
end;
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;
