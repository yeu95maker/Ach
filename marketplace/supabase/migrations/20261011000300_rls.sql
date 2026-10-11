-- =============================================================================
-- Row Level Security
--
-- Listings (properties + child tables) have NO public read policy on purpose:
-- customers read them through public.search_properties / public.get_property,
-- which apply premium locking. Direct table access is for owners and admins.
-- =============================================================================

alter table public.app_settings           enable row level security;
alter table public.profiles               enable row level security;
alter table public.providers              enable row level security;
alter table public.provider_verifications enable row level security;
alter table public.properties             enable row level security;
alter table public.property_features      enable row level security;
alter table public.property_images        enable row level security;
alter table public.property_nearby        enable row level security;
alter table public.property_view_events   enable row level security;
alter table public.favorites              enable row level security;
alter table public.saved_searches         enable row level security;
alter table public.notifications          enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.memberships            enable row level security;
alter table public.payments               enable row level security;
alter table public.reports                enable row level security;

-- Least privilege: anon gets nothing on tables except what is granted below.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
grant select on public.app_settings to anon;
grant select on public.providers to anon;

-- app_settings ---------------------------------------------------------------
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_admin on public.app_settings for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- profiles -------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or private.is_admin()) with check (id = auth.uid() or private.is_admin());

-- providers: verified providers are public ------------------------------------
create policy providers_public on public.providers for select to anon, authenticated
  using (status = 'verified' or owner_id = auth.uid() or private.is_admin());
create policy providers_insert on public.providers for insert to authenticated
  with check (owner_id = auth.uid() and private.my_provider_id() is null);
create policy providers_update on public.providers for update to authenticated
  using (owner_id = auth.uid() or private.is_admin()) with check (owner_id = auth.uid() or private.is_admin());

-- provider_verifications: own + admin; written via submit_provider_verification
create policy provider_verifications_select on public.provider_verifications for select to authenticated
  using (provider_id = private.my_provider_id() or private.is_admin());

-- properties -----------------------------------------------------------------
create policy properties_owner_select on public.properties for select to authenticated
  using (provider_id = private.my_provider_id() or private.is_admin());
create policy properties_owner_insert on public.properties for insert to authenticated
  with check (provider_id = private.my_provider_id());
create policy properties_owner_update on public.properties for update to authenticated
  using (provider_id = private.my_provider_id()) with check (provider_id = private.my_provider_id());
create policy properties_owner_delete on public.properties for delete to authenticated
  using (provider_id = private.my_provider_id() and status in ('draft', 'rejected'));
create policy properties_admin on public.properties for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- listing children -------------------------------------------------------------
create policy property_features_owner on public.property_features for all to authenticated
  using (private.owns_property(property_id) or private.is_admin())
  with check (private.owns_property(property_id) or private.is_admin());
create policy property_images_owner on public.property_images for all to authenticated
  using (private.owns_property(property_id) or private.is_admin())
  with check (private.owns_property(property_id) or private.is_admin());
create policy property_nearby_owner on public.property_nearby for all to authenticated
  using (private.owns_property(property_id) or private.is_admin())
  with check (private.owns_property(property_id) or private.is_admin());
-- property_view_events: no policies → only via record_property_view().

-- favorites ------------------------------------------------------------------
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- saved searches ----------------------------------------------------------------
create policy saved_searches_own on public.saved_searches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications ----------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- conversations / messages -----------------------------------------------------
create policy conversations_participants on public.conversations for select to authenticated
  using (customer_id = auth.uid() or provider_id = private.my_provider_id() or private.is_admin());
create policy messages_participants on public.messages for select to authenticated
  using (private.is_conversation_participant(conversation_id) or private.is_admin());
create policy messages_send on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and private.is_conversation_participant(conversation_id));

-- memberships / payments: read-only for the user; written by billing code -------
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- reports -----------------------------------------------------------------------
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and private.is_listed(property_id));
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or private.is_admin());

-- Column-level: users never write these directly.
revoke insert, update, delete on public.memberships, public.payments, public.provider_verifications,
  public.conversations, public.property_view_events from authenticated;
revoke update, delete on public.messages, public.reports from authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: new messages are pushed to participants (RLS applies)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- Storage
--   property-images:   public read; providers write into "<provider_id>/..."
--   verification-docs: private; users write into "<user_id>/...", admins read
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('property-images', 'property-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy property_images_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = private.my_provider_id()::text
              and not private.is_suspended());
create policy property_images_manage on storage.objects for delete to authenticated
  using (bucket_id = 'property-images' and (storage.foldername(name))[1] = private.my_provider_id()::text);
create policy property_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'property-images');

create policy verification_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verification_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or private.is_admin()));
