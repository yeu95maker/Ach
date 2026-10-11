-- =============================================================================
-- Marketplace test suite: visibility, premium locking, provider verification,
-- moderation, messaging, favorites, memberships, admin.
-- Each block impersonates a caller exactly like PostgREST does (role +
-- request.jwt.claims) and runs in its own rolled-back transaction.
-- =============================================================================
\o /dev/null
\set admin   'a0000000-0000-4000-8000-000000000001'
\set tariro  'c0000000-0000-4000-8000-000000000001'
\set farai   'c0000000-0000-4000-8000-000000000002'
\set abc     'b0000000-0000-4000-8000-000000000001'
\set kudzi   'b0000000-0000-4000-8000-000000000002'
\set nyasha  'b0000000-0000-4000-8000-000000000004'

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

-- Raises unless p_sql fails with a message containing p_expected.
create or replace function pg_temp.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 and p_expected <> '*' then
      raise exception 'expected error "%" but got "%" for: %', p_expected, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'expected error "%" for: %', p_expected, p_sql;
end $$;

-- -----------------------------------------------------------------------------
-- Anonymous visitors
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as_anon();
do $$
declare
  r jsonb;
  locked jsonb;
begin
  perform pg_temp.expect_error('select 1 from public.properties', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.provider_verifications', 'permission denied');
  perform pg_temp.expect_error('select 1 from public.memberships', 'permission denied');
  assert (select count(*) from public.providers) = 3, 'anon sees only the 3 verified providers';

  r := public.search_properties('{}');
  assert (r ->> 'total')::int = 16, 'all active listings are discoverable (incl. locked teasers)';
  assert not exists (select 1 from jsonb_array_elements(r -> 'items') i
                     where (i ->> 'locked')::boolean and (i -> 'price' <> 'null'::jsonb or i -> 'title' <> 'null'::jsonb or i -> 'provider' <> 'null'::jsonb)),
         'locked teasers carry no price, title or provider';
  assert (select count(*) from jsonb_array_elements(r -> 'items') i where (i ->> 'locked')::boolean) = 3,
         '2 members-only + 1 early-access listing are locked';
  assert not exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'id' in (
           'e0000000-0000-4000-8000-000000000017', 'e0000000-0000-4000-8000-000000000018')),
         'pending and draft listings are not public';

  -- Price filters drop locked listings (no price probing).
  r := public.search_properties('{"min_price":1}');
  assert (r ->> 'total')::int = 13, 'price filter excludes locked listings';
  r := public.search_properties('{"sort":"price_asc"}');
  assert ((r -> 'items' -> 15) ->> 'locked')::boolean, 'locked listings come last when sorting by price';

  perform pg_temp.expect_error($q$select public.search_properties('{"features":["pool"]}')$q$, 'PREMIUM_REQUIRED');
  perform pg_temp.expect_error($q$select public.search_properties('{"max_age_days":7}')$q$, 'PREMIUM_REQUIRED');

  -- Basic filters
  r := public.search_properties('{"category":"land","area":"borrowdale"}');
  assert (r ->> 'total')::int = 2, 'category + area (case-insensitive)';
  r := public.search_properties('{"category":"house","min_bedrooms":4,"min_price":100000,"max_price":250000}');
  assert (r ->> 'total')::int = 2, 'houses 100k–250k with ≥4 bedrooms';
  r := public.search_properties('{"bbox":[31.08,-17.76,31.11,-17.73]}');
  assert (r ->> 'total')::int between 2 and 4, 'bounding box search around Borrowdale';

  -- Property page
  locked := public.get_property('e0000000-0000-4000-8000-000000000005');
  assert (locked ->> 'locked')::boolean and locked ->> 'lock_reason' = 'members_only', 'members-only listing is locked';
  assert locked -> 'description' = 'null'::jsonb and locked -> 'price' = 'null'::jsonb, 'locked: no description/price';
  assert jsonb_array_length(locked -> 'images') = 1, 'locked: only the cover image';
  assert public.get_property('e0000000-0000-4000-8000-000000000012') ->> 'lock_reason' = 'early_access', 'early access teaser';
  r := public.get_property('e0000000-0000-4000-8000-000000000001');
  assert not (r ->> 'locked')::boolean and (r ->> 'price')::numeric = 180000, 'normal listing is fully visible';
  assert jsonb_array_length(r -> 'images') = 3 and jsonb_array_length(r -> 'nearby') = 4, 'gallery and nearby places';
  assert r -> 'provider' ->> 'name' = 'ABC Properties' and (r -> 'provider' ->> 'verified')::boolean, 'provider block';
  assert public.get_property('e0000000-0000-4000-8000-000000000017') is null, 'pending listing hidden';
  assert public.get_property('e0000000-0000-4000-8000-000000000018') is null, 'draft listing hidden';

  -- Approximate location: never the exact coordinates, but close by.
  assert (r ->> 'lat')::float8 <> -17.7468 and abs((r ->> 'lat')::float8 - -17.7468) < 0.006, 'approximate latitude';
  assert abs((r ->> 'lng')::float8 - 31.0961) < 0.006, 'approximate longitude';
  assert r -> 'latitude' is null, 'exact latitude not exposed';

  perform pg_temp.expect_error($q$select public.start_conversation('e0000000-0000-4000-8000-000000000001', 'hi')$q$, 'AUTH_REQUIRED');
  perform pg_temp.expect_error($q$select public.billing_demo_checkout('month')$q$, '*');
  perform pg_temp.expect_error($q$select public.admin_stats()$q$, 'ADMIN_ONLY');
  perform pg_temp.expect_error($q$select public.billing_record_payment('c0000000-0000-4000-8000-000000000001', 'month', 'x', 'y', 1, 'USD')$q$, 'permission denied');
  assert public.my_account() is null, 'no account for anon';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Free customer (Tariro)
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as(:'tariro');
do $$
declare
  v_conv uuid;
  v_views int;
  v_acc jsonb;
begin
  v_acc := public.my_account();
  assert not (v_acc ->> 'is_premium')::boolean and (v_acc ->> 'favorites_count')::int = 2, 'free account with 2 favorites';
  assert public.get_property('e0000000-0000-4000-8000-000000000005') ->> 'locked' = 'true', 'members-only locked for free users';

  -- Profile flags are protected
  update public.profiles set is_admin = true, full_name = 'Tariro N.' where id = auth.uid();
  assert (select not is_admin and full_name = 'Tariro N.' from public.profiles where id = auth.uid()), 'cannot self-promote to admin';

  -- Memberships / payments are read-only
  perform pg_temp.expect_error($q$insert into public.memberships (user_id, current_period_end) values (auth.uid(), now() + interval '1 year')$q$, 'permission denied');
  perform pg_temp.expect_error($q$insert into public.saved_searches (user_id, name) values (auth.uid(), 'x')$q$, 'PREMIUM_REQUIRED');

  -- Messaging: locked listings cannot be contacted
  perform pg_temp.expect_error($q$select public.start_conversation('e0000000-0000-4000-8000-000000000005', 'hi')$q$, 'PREMIUM_REQUIRED');
  v_conv := public.start_conversation('e0000000-0000-4000-8000-000000000008', 'Is the price negotiable?');
  assert v_conv = public.start_conversation('e0000000-0000-4000-8000-000000000008'), 'one conversation per property and customer';
  assert (select count(*) from public.messages where conversation_id = v_conv) = 1, 'first message stored';
  assert (public.get_conversation(v_conv) -> 'property' ->> 'title') = 'Family Home', 'property is attached to the conversation';
  assert (select count(*) from public.conversations) = 2, 'customer sees only own conversations';
  insert into public.messages (conversation_id, sender_id, body) values ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'spoof');
  assert (select sender_id from public.messages where body = 'spoof') = auth.uid(), 'sender cannot be spoofed';
  perform pg_temp.expect_error($q$insert into public.messages (conversation_id, sender_id, body) values (gen_random_uuid(), auth.uid(), 'x')$q$, '*');
  insert into public.messages (conversation_id, sender_id, body) values ('f0000000-0000-4000-8000-000000000001', auth.uid(), '  Thanks!  ');
  assert (select body from public.messages where conversation_id = 'f0000000-0000-4000-8000-000000000001' order by created_at desc limit 1) = 'Thanks!', 'body trimmed';

  -- Favorites limit (10 for free accounts)
  insert into public.favorites (user_id, property_id)
  select auth.uid(), ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(3, 10) n;
  assert (select count(*) from public.favorites) = 10, 'ten favorites';
  perform pg_temp.expect_error($q$insert into public.favorites (user_id, property_id) values (auth.uid(), 'e0000000-0000-4000-8000-000000000011')$q$, 'FAVORITES_LIMIT');
  perform pg_temp.expect_error($q$insert into public.favorites (user_id, property_id) values ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000011')$q$, '*');

  -- Views: once per viewer and day
  v_views := (select view_count from public.properties where id = 'e0000000-0000-4000-8000-000000000003');
  assert v_views is null, 'customers cannot read the properties table';
  perform public.record_property_view('e0000000-0000-4000-8000-000000000003', 'ignored-for-users');
  perform public.record_property_view('e0000000-0000-4000-8000-000000000003', 'ignored-for-users');

  -- Reports
  insert into public.reports (property_id, reporter_id, reason, details) values ('e0000000-0000-4000-8000-000000000001', auth.uid(), 'duplicate', 'Same as another listing');
  perform pg_temp.expect_error($q$insert into public.reports (property_id, reporter_id, reason) values ('e0000000-0000-4000-8000-000000000001', auth.uid(), 'scam')$q$, 'ALREADY_REPORTED');
  perform pg_temp.expect_error($q$insert into public.reports (property_id, reporter_id, reason) values ('e0000000-0000-4000-8000-000000000017', auth.uid(), 'scam')$q$, '*');

  -- Customers cannot become verified on their own
  insert into public.providers (owner_id, display_name, provider_type, status) values (auth.uid(), 'Tariro Homes', 'owner', 'verified');
  assert (select status from public.providers where owner_id = auth.uid()) = 'unverified', 'new providers start unverified';
  update public.providers set status = 'verified' where owner_id = auth.uid();
  assert (select status from public.providers where owner_id = auth.uid()) = 'unverified', 'status not writable';
  perform pg_temp.expect_error($q$insert into public.properties (provider_id, category, title, city, area, latitude, longitude, price, land_size_m2, status)
    select id, 'land', 'My stand for sale', 'Harare', 'Avondale', -17.8, 31.04, 1000, 300, 'pending' from public.providers where owner_id = auth.uid()$q$, 'PROVIDER_NOT_VERIFIED');
end $$;
-- the view counter moved by exactly one
reset role;
do $$ begin
  assert (select view_count from public.properties where id = 'e0000000-0000-4000-8000-000000000003') = 311, 'one view per day';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Demo checkout → premium unlocks; cancel / resume / expiry
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as(:'tariro');
do $$
declare r jsonb;
begin
  perform public.billing_demo_checkout('month');
  assert (public.my_account() ->> 'is_premium')::boolean, 'premium after checkout';
  assert (select count(*) from public.payments where status = 'succeeded') = 1, 'payment booked';
  r := public.get_property('e0000000-0000-4000-8000-000000000005');
  assert not (r ->> 'locked')::boolean and (r ->> 'price')::numeric = 320000, 'members-only unlocked';
  assert (public.search_properties('{"features":["pool"]}') ->> 'total')::int = 2, 'advanced filters unlocked';
  perform public.cancel_membership();
  assert (public.my_account() -> 'membership' ->> 'cancel_at_period_end')::boolean, 'cancel at period end';
  assert (public.my_account() ->> 'is_premium')::boolean, 'still premium until period end';
  perform public.resume_membership();
  assert (public.my_account() -> 'membership' ->> 'status') = 'active', 'resumed';
end $$;
reset role;
update public.memberships set current_period_end = now() - interval '1 minute' where user_id = :'tariro';
select public.expire_memberships();
select pg_temp.act_as(:'tariro');
do $$ begin
  assert not (public.my_account() ->> 'is_premium')::boolean, 'expired → free again';
  assert public.my_account() -> 'membership' ->> 'status' = 'expired', 'status expired';
end $$;
rollback;

begin;
update public.app_settings set demo_billing = false;
select pg_temp.act_as(:'tariro');
do $$ begin
  perform pg_temp.expect_error($q$select public.billing_demo_checkout('month')$q$, 'DEMO_BILLING_DISABLED');
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Premium customer (Farai)
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as(:'farai');
do $$
declare r jsonb;
begin
  r := public.search_properties('{}');
  assert not exists (select 1 from jsonb_array_elements(r -> 'items') i where (i ->> 'locked')::boolean), 'premium sees everything';
  assert (public.search_properties('{"min_price":1}') ->> 'total')::int = 16, 'price filter includes premium listings';
  assert public.get_property('e0000000-0000-4000-8000-000000000012') ->> 'locked' = 'false', 'early access for premium';
  insert into public.saved_searches (user_id, name, filters) values (auth.uid(), 'Houses with pool', '{"category":"house","features":["pool"]}');
  assert (select count(*) from public.saved_searches) = 2, 'saved searches for premium';
  perform public.start_conversation('e0000000-0000-4000-8000-000000000005', 'Viewing on Saturday?');
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Unverified provider (Nyasha, verification pending)
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as(:'nyasha');
do $$
declare v_id uuid;
begin
  insert into public.properties (provider_id, category, title, city, area, latitude, longitude, price, living_area_m2, status)
  values ('d0000000-0000-4000-8000-000000000004', 'commercial', 'Warehouse in Msasa', 'Harare', 'Msasa', -17.84, 31.12, 200000, 1200, 'draft')
  returning id into v_id;
  assert (select status from public.properties where id = v_id) = 'draft', 'drafts allowed before verification';
  perform pg_temp.expect_error(format($q$update public.properties set status = 'pending' where id = %L$q$, v_id), 'PROVIDER_NOT_VERIFIED');
  perform pg_temp.expect_error(format($q$update public.properties set status = 'active' where id = %L$q$, v_id), 'INVALID_STATUS_TRANSITION');
  perform pg_temp.expect_error($q$select public.submit_provider_verification('{}')$q$, 'INVALID_STATUS');
  assert public.get_property(v_id) ->> 'status' = 'draft', 'owner can preview own draft';
  assert (select count(*) from public.provider_verifications) = 1, 'own verification visible';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Verified provider (ABC Properties)
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as(:'abc');
do $$
declare
  v_id uuid;
  d jsonb;
  n int;
begin
  insert into public.properties (provider_id, category, title, city, area, latitude, longitude, price, land_size_m2, status, is_premium, view_count)
  values ('d0000000-0000-4000-8000-000000000001', 'land', 'Stand near Sam Levy''s Village', 'Harare', 'Borrowdale', -17.75, 31.10, 42000, 800, 'pending', true, 999)
  returning id into v_id;
  select to_jsonb(p) into d from public.properties p where id = v_id;
  assert d ->> 'status' = 'pending' and d ->> 'is_premium' = 'false' and (d ->> 'view_count')::int = 0, 'protected columns reset';
  assert d ->> 'submitted_at' is not null, 'submitted_at set';
  perform pg_temp.expect_error(format($q$update public.properties set status = 'active' where id = %L$q$, v_id), 'INVALID_STATUS_TRANSITION');
  update public.properties set early_access_until = now() + interval '1 day', price = 41000 where id = v_id;
  assert (select early_access_until is null and price = 41000 from public.properties where id = v_id), 'only editable fields change';

  insert into public.property_features (property_id, feature) values (v_id, 'water');
  perform pg_temp.expect_error($q$insert into public.property_features (property_id, feature) values ('e0000000-0000-4000-8000-000000000008', 'pool')$q$, '*');
  update public.properties set price = 1 where id = 'e0000000-0000-4000-8000-000000000008';
  get diagnostics n = row_count;
  assert n = 0, 'cannot edit foreign listings';
  assert (select count(*) from public.properties where provider_id <> 'd0000000-0000-4000-8000-000000000001') = 0, 'only own listings';

  -- Storage: only into the own provider folder
  insert into storage.objects (bucket_id, name) values ('property-images', 'd0000000-0000-4000-8000-000000000001/x/1.jpg');
  perform pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('property-images', 'd0000000-0000-4000-8000-000000000002/x/1.jpg')$q$, '*');

  -- Dashboard & inbox
  d := public.provider_dashboard();
  assert (select (x ->> 'inquiries')::int from jsonb_array_elements(d) x where x ->> 'id' = 'e0000000-0000-4000-8000-000000000001') = 1, 'inquiries';
  assert (select (x ->> 'views')::int from jsonb_array_elements(d) x where x ->> 'id' = 'e0000000-0000-4000-8000-000000000002') = 1240, 'views';
  assert (public.my_account() ->> 'unread_messages')::int = 1, 'unread conversation for provider';
  perform public.mark_conversation_read('f0000000-0000-4000-8000-000000000001');
  assert (public.my_account() ->> 'unread_messages')::int = 0, 'read';
  insert into public.messages (conversation_id, sender_id, body) values ('f0000000-0000-4000-8000-000000000001', auth.uid(), 'Saturday at 10?');
  perform pg_temp.expect_error($q$select public.start_conversation('e0000000-0000-4000-8000-000000000001')$q$, 'OWN_PROPERTY');
  perform pg_temp.expect_error($q$select public.admin_moderate_property('e0000000-0000-4000-8000-000000000017', 'approve')$q$, 'ADMIN_ONLY');
end $$;
rollback;

-- Kudzi (another provider) cannot read ABC's conversation
begin;
select pg_temp.act_as(:'kudzi');
do $$ begin
  assert (select count(*) from public.conversations) = 0, 'no foreign conversations';
  assert (select count(*) from public.messages) = 0, 'no foreign messages';
  assert public.get_conversation('f0000000-0000-4000-8000-000000000001') is null, 'no foreign conversation via RPC';
end $$;
rollback;

-- -----------------------------------------------------------------------------
-- Admin: verification, moderation, alerts, suspension, reports
-- -----------------------------------------------------------------------------
begin;
select pg_temp.act_as(:'admin');
do $$
declare s jsonb;
begin
  s := public.admin_stats();
  assert (s ->> 'properties_active')::int = 16 and (s ->> 'providers_pending')::int = 1 and (s ->> 'reports_open')::int = 1, 'stats';
  assert (s ->> 'premium_members')::int = 2, 'premium members';
  assert jsonb_array_length(public.admin_list_providers('pending')) = 1, 'pending providers';
  assert jsonb_array_length(public.admin_list_properties('pending')) = 1, 'pending listings';

  perform public.admin_review_provider('d0000000-0000-4000-8000-000000000004', true, null);
  assert (select status from public.providers where id = 'd0000000-0000-4000-8000-000000000004') = 'verified', 'provider verified';
  assert exists (select 1 from public.provider_verifications where provider_id = 'd0000000-0000-4000-8000-000000000004' and status = 'approved'), 'verification approved';

  -- Approving a matching listing alerts Farai's saved search ("Land in Borrowdale under $50,000")
  update public.properties set category = 'land', area = 'Borrowdale', price = 45000, land_size_m2 = 800 where id = 'e0000000-0000-4000-8000-000000000017';
  perform public.admin_moderate_property('e0000000-0000-4000-8000-000000000017', 'approve', null, true);
end $$;
reset role;
do $$ begin
  assert (select status from public.properties where id = 'e0000000-0000-4000-8000-000000000017') = 'active', 'approved';
  assert (select early_access_until > now() from public.properties where id = 'e0000000-0000-4000-8000-000000000017'), 'early access started';
  assert exists (select 1 from public.notifications where user_id = 'c0000000-0000-4000-8000-000000000002' and kind = 'saved_search_match'), 'saved search alert';
  assert exists (select 1 from public.notifications where user_id = 'b0000000-0000-4000-8000-000000000001' and kind = 'property_approved'), 'provider notified';
end $$;
select pg_temp.act_as(:'admin');
do $$ begin
  -- Price drop notifies favorites
  update public.properties set price = 170000 where id = 'e0000000-0000-4000-8000-000000000001';
  -- Suspending a provider hides all its listings
  perform public.admin_set_provider_suspended('d0000000-0000-4000-8000-000000000002', true, 'Under investigation');
  perform public.admin_resolve_report((select id from public.reports where status = 'open' limit 1), 'resolved', 'Removed', true);
end $$;
select pg_temp.act_as_anon();
do $$ begin
  assert (public.search_properties('{"provider_id":"d0000000-0000-4000-8000-000000000002"}') ->> 'total')::int = 0, 'suspended provider hidden';
  assert public.get_property('e0000000-0000-4000-8000-000000000008') is null, 'suspended provider listing hidden';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = 'c0000000-0000-4000-8000-000000000001' and kind = 'favorite_price_drop'), 'price drop alert';
  assert (select status from public.properties where id = 'e0000000-0000-4000-8000-000000000009') = 'removed', 'reported listing removed';
  assert not exists (select 1 from public.reports where status = 'open'), 'reports closed';
end $$;
rollback;

-- Suspended users cannot message or list
begin;
update public.profiles set is_suspended = true where id = 'c0000000-0000-4000-8000-000000000001';
select pg_temp.act_as(:'tariro');
do $$ begin
  perform pg_temp.expect_error($q$select public.start_conversation('e0000000-0000-4000-8000-000000000003', 'hi')$q$, 'ACCOUNT_SUSPENDED');
  perform pg_temp.expect_error($q$insert into public.messages (conversation_id, sender_id, body) values ('f0000000-0000-4000-8000-000000000001', auth.uid(), 'x')$q$, 'ACCOUNT_SUSPENDED');
end $$;
rollback;

-- Cron helpers
begin;
do $$ begin
  assert public.request_availability_confirmations(30) = 1, 'one stale listing asks for confirmation';
  assert public.request_availability_confirmations(30) = 0, 'not twice';
end $$;
select pg_temp.act_as(:'kudzi');
do $$ begin
  perform public.confirm_property_available('e0000000-0000-4000-8000-000000000015');
  perform pg_temp.expect_error($q$select public.confirm_property_available('e0000000-0000-4000-8000-000000000001')$q$, 'NOT_OWNER');
  perform pg_temp.expect_error($q$select public.expire_memberships()$q$, 'permission denied');
end $$;
rollback;

\o
\echo '  ✓ marketplace tests'
