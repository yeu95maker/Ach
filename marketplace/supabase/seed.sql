-- =============================================================================
-- Development / demo data – Harare, Zimbabwe.
-- All accounts use the password  Marketplace!2026
-- =============================================================================

update public.app_settings set demo_billing = true;

create or replace function pg_temp.mk_user(p_id uuid, p_email text, p_name text, p_locale text default 'en') returns uuid
language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          extensions.crypt('Marketplace!2026', extensions.gen_salt('bf')), now(), '', '', '', '',
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name, 'locale', p_locale));
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email), 'email', now());
  select p_id
$$;

select count(*) as users_created from (values
  (pg_temp.mk_user('a0000000-0000-4000-8000-000000000001', 'admin@demo.property', 'Platform Admin')),
  (pg_temp.mk_user('c0000000-0000-4000-8000-000000000001', 'tariro@demo.property', 'Tariro Ncube')),
  (pg_temp.mk_user('c0000000-0000-4000-8000-000000000002', 'farai@demo.property', 'Farai Chikore')),
  (pg_temp.mk_user('c0000000-0000-4000-8000-000000000003', 'lena@demo.property', 'Lena Hoffmann', 'de')),
  (pg_temp.mk_user('b0000000-0000-4000-8000-000000000001', 'abc@demo.property', 'Rudo Mutasa')),
  (pg_temp.mk_user('b0000000-0000-4000-8000-000000000002', 'kudzi@demo.property', 'Kudzai Moyo')),
  (pg_temp.mk_user('b0000000-0000-4000-8000-000000000003', 'sunrise@demo.property', 'Tendai Dube')),
  (pg_temp.mk_user('b0000000-0000-4000-8000-000000000004', 'newagent@demo.property', 'Nyasha Banda'))
) u(id);

update public.profiles set is_admin = true where id = 'a0000000-0000-4000-8000-000000000001';

-- Farai is a premium member (annual), Lena too (monthly, cancels at period end)
insert into public.memberships (user_id, status, billing_interval, current_period_start, current_period_end, payment_provider)
values ('c0000000-0000-4000-8000-000000000002', 'active', 'year', now() - interval '20 days', now() + interval '345 days', 'demo'),
       ('c0000000-0000-4000-8000-000000000003', 'canceled', 'month', now() - interval '10 days', now() + interval '20 days', 'demo');
update public.memberships set cancel_at_period_end = true where user_id = 'c0000000-0000-4000-8000-000000000003';
insert into public.payments (user_id, amount, currency, status, payment_provider, external_reference, billing_interval, period_start, period_end, created_at)
values ('c0000000-0000-4000-8000-000000000002', 90, 'USD', 'succeeded', 'demo', 'seed-1', 'year', now() - interval '20 days', now() + interval '345 days', now() - interval '20 days'),
       ('c0000000-0000-4000-8000-000000000003', 9, 'USD', 'succeeded', 'demo', 'seed-2', 'month', now() - interval '10 days', now() + interval '20 days', now() - interval '10 days');

-- Providers --------------------------------------------------------------------
insert into public.providers (id, owner_id, display_name, provider_type, city, about, status, verified_at, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'ABC Properties', 'agent', 'Harare',
   'ABC Properties specialises in residential properties and land in Harare''s northern suburbs.', 'verified', now() - interval '60 days', now() - interval '90 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Kudzai Moyo', 'private_seller', 'Harare',
   'Selling my family home and a stand in Ruwa.', 'verified', now() - interval '30 days', now() - interval '35 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'Sunrise Developers', 'developer', 'Harare',
   'New residential estates and serviced stands with water, electricity and tarred roads.', 'verified', now() - interval '45 days', now() - interval '50 days'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', 'Banda Realty', 'agent', 'Harare',
   'Commercial and residential agency.', 'pending', null, now() - interval '2 days');

insert into public.provider_verifications (provider_id, legal_name, contact_phone, contact_email, id_document_type, id_document_number,
                                           business_name, business_registration_number, agent_license_number, status, reviewed_at, created_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'ABC Properties (Pvt) Ltd', '+263 77 000 0001', 'abc@demo.property', 'national_id', '63-000001-A-00',
   'ABC Properties (Pvt) Ltd', '1234/2015', 'EAC-0101', 'approved', now() - interval '60 days', now() - interval '61 days'),
  ('d0000000-0000-4000-8000-000000000002', 'Kudzai Moyo', '+263 77 000 0002', 'kudzi@demo.property', 'passport', 'FN000002',
   null, null, null, 'approved', now() - interval '30 days', now() - interval '31 days'),
  ('d0000000-0000-4000-8000-000000000003', 'Sunrise Developers (Pvt) Ltd', '+263 77 000 0003', 'sunrise@demo.property', 'national_id', '63-000003-C-00',
   'Sunrise Developers (Pvt) Ltd', '5678/2019', null, 'approved', now() - interval '45 days', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-000000000004', 'Nyasha Banda', '+263 77 000 0004', 'newagent@demo.property', 'national_id', '63-000004-D-00',
   'Banda Realty', '9012/2024', 'EAC-0420', 'pending', null, now() - interval '2 days');

-- Properties -------------------------------------------------------------------
-- (id suffix, provider, category, title, area, lat, lng, price, land, living, bed, bath, parking, status, days ago, premium, image)
create temp table seed_props (
  n int, provider int, category public.property_category, title text, area text, lat float8, lng float8,
  price numeric, land numeric, living numeric, bed int, bath int, parking int,
  status public.property_status, days int, premium boolean, image text, features text[], description text);

insert into seed_props values
 (1, 1, 'house', 'Modern Family House', 'Borrowdale', -17.7468, 31.0961, 180000, 1200, 240, 4, 3, 2, 'active', 3, false, 'house-1',
  '{garage,garden,parking,electricity,water,road_access}',
  'Modern four-bedroom family home located in Borrowdale with a large garden, double garage and excellent access to nearby shops and schools.'),
 (2, 1, 'land', 'Residential Stand', 'Borrowdale', -17.7395, 31.1032, 25000, 500, null, null, null, null, 'active', 6, false, 'land-1',
  '{electricity,water,road_access}', 'Serviced residential stand in a quiet close. Title deeds available for inspection.'),
 (3, 1, 'house', 'Garden Cottage with Pool', 'Avondale', -17.7990, 31.0371, 120000, 900, 160, 3, 2, 1, 'active', 10, false, 'house-2',
  '{garden,pool,parking,electricity,water,road_access}', 'Charming three-bedroom cottage with a pool, close to Avondale shops.'),
 (4, 1, 'apartment', 'Two-Bedroom Apartment', 'Avondale', -17.8021, 31.0402, 65000, null, 85, 2, 1, 1, 'active', 2, false, 'apartment-1',
  '{balcony,parking,electricity,water}', 'Bright second-floor apartment with balcony, secure parking and backup water.'),
 (5, 1, 'house', 'Executive Home', 'Highlands', -17.7975, 31.0903, 320000, 2000, 380, 5, 4, 3, 'active', 1, true, 'house-3',
  '{garage,garden,pool,terrace,parking,electricity,water,road_access}', 'Exclusive executive home on a large landscaped plot. Members only.'),
 (6, 1, 'land', 'Large Plot', 'Glen Lorne', -17.7447, 31.1370, 48000, 4000, null, null, null, null, 'active', 15, false, 'land-2',
  '{road_access,electricity}', 'Large plot with mature trees and a gentle slope with views.'),
 (7, 1, 'commercial', 'Office Building', 'Eastlea', -17.8252, 31.0705, 450000, 1500, 900, null, 6, 20, 'active', 20, false, 'commercial-1',
  '{parking,electricity,water,road_access}', 'Three-storey office building with generator and borehole.'),
 (8, 2, 'house', 'Family Home', 'Mount Pleasant', -17.7720, 31.0450, 155000, 1400, 210, 4, 2, 2, 'active', 8, false, 'house-4',
  '{garage,garden,electricity,water,road_access}', 'Well-kept family home close to the University of Zimbabwe.'),
 (9, 2, 'land', 'Stand in Ruwa', 'Ruwa', -17.8890, 31.2410, 15000, 600, null, null, null, null, 'active', 12, false, 'land-3',
  '{road_access}', 'Residential stand. Water and electricity connections in progress.'),
 (10, 3, 'land', 'Serviced Stand – Phase 2', 'Hatfield', -17.8800, 31.0900, 22000, 400, null, null, null, null, 'active', 4, false, 'land-1',
  '{electricity,water,road_access}', 'Fully serviced stand in our Phase 2 estate: tarred roads, water and electricity.'),
 (11, 3, 'land', 'Serviced Stand – Phase 2 (corner)', 'Hatfield', -17.8812, 31.0921, 26000, 520, null, null, null, null, 'active', 4, false, 'land-2',
  '{electricity,water,road_access}', 'Corner stand in our Phase 2 estate.'),
 (12, 3, 'apartment', 'New Garden Flat', 'Greendale', -17.8160, 31.1190, 72000, null, 95, 2, 2, 1, 'active', 0, false, 'apartment-2',
  '{garden,parking,electricity,water}', 'Brand-new ground-floor garden flat in a secure complex.'),
 (13, 3, 'house', 'Townhouse in Gated Estate', 'Chisipite', -17.7800, 31.1180, 140000, 450, 180, 3, 2, 2, 'active', 0, false, 'house-2',
  '{garage,garden,parking,electricity,water,road_access}', 'Three-bedroom townhouse in a gated estate with 24h security.'),
 (14, 1, 'commercial', 'Retail Shop', 'Msasa', -17.8400, 31.1200, 95000, 300, 220, null, 1, 6, 'active', 30, false, 'commercial-2',
  '{parking,electricity,water,road_access}', 'Retail unit on a busy road with ample customer parking.'),
 (15, 2, 'house', 'Starter Home', 'Waterfalls', -17.8900, 31.0100, 45000, 300, 80, 2, 1, 1, 'active', 40, false, 'house-4',
  '{garden,electricity,water}', 'Compact starter home, recently renovated.'),
 (16, 1, 'land', 'Prime Stand (Members only)', 'Borrowdale', -17.7430, 31.0890, 60000, 1500, null, null, null, null, 'active', 1, true, 'land-3',
  '{electricity,water,road_access}', 'Prime 1,500 m² residential stand in Borrowdale Brooke.'),
 (17, 1, 'house', 'Renovated Bungalow', 'Marlborough', -17.7510, 30.9920, 98000, 1000, 150, 3, 2, 2, 'pending', 0, false, 'house-1',
  '{garage,garden,electricity,water}', 'Renovated bungalow awaiting moderation.'),
 (18, 3, 'apartment', 'Penthouse (draft)', 'Belvedere', -17.8300, 31.0200, 130000, null, 140, 3, 2, 2, 'draft', 0, false, 'apartment-1',
  '{balcony,terrace,parking}', 'Draft listing.');

insert into public.properties (id, provider_id, category, title, description, city, area, latitude, longitude,
                               price, land_size_m2, living_area_m2, bedrooms, bathrooms, parking_spaces,
                               status, is_premium, submitted_at, published_at, created_at)
select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('d0000000-0000-4000-8000-' || lpad(provider::text, 12, '0'))::uuid,
       category, title, description, 'Harare', area, lat, lng, price, land, living, bed, bath, parking,
       status, premium,
       case when status <> 'draft' then now() - make_interval(days => days) end,
       case when status = 'active' then now() - make_interval(days => days) end,
       now() - make_interval(days => days + 1)
from seed_props;

-- Early access: the Greendale flat is visible to premium members first
update public.properties set early_access_until = now() + interval '40 hours'
where id = 'e0000000-0000-4000-8000-000000000012';
-- Older listing that should ask its provider for confirmation
update public.properties set last_confirmed_at = now() - interval '40 days'
where id = 'e0000000-0000-4000-8000-000000000015';

insert into public.property_features (property_id, feature)
select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, f::public.property_feature
from seed_props, unnest(features) f;

-- Images: demo illustrations shipped in /public/demo (absolute paths are used as-is by the app)
insert into public.property_images (property_id, storage_path, position)
select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '/demo/' || img || '.svg', pos
from seed_props,
     lateral (values (image, 0),
                     (case category when 'land' then 'land-' || ((n % 3) + 1) when 'apartment' then 'apartment-' || ((n % 2) + 1)
                                    when 'commercial' then 'commercial-' || ((n % 2) + 1) else 'house-' || ((n % 4) + 1) end, 1),
                     ('interior-' || ((n % 3) + 1), 2)) v(img, pos)
where not (category = 'land' and pos = 2);

insert into public.property_nearby (property_id, kind, name, distance_m)
select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, kind::public.nearby_kind, name, dist
from seed_props, lateral (values
  ('school', area || ' Primary School', 600 + n * 70),
  ('shopping', area || ' Shopping Centre', 1100 + n * 90),
  ('hospital', 'Nearest clinic', 2500 + n * 150),
  ('main_road', 'Main road', 300 + n * 25)) v(kind, name, dist);

-- Activity -----------------------------------------------------------------------
update public.properties set view_count = 1240 where id = 'e0000000-0000-4000-8000-000000000002';
update public.properties set view_count = 840  where id = 'e0000000-0000-4000-8000-000000000001';
update public.properties set view_count = 310  where id = 'e0000000-0000-4000-8000-000000000003';

insert into public.favorites (user_id, property_id) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000005');

insert into public.saved_searches (user_id, name, filters) values
  ('c0000000-0000-4000-8000-000000000002', 'Land in Borrowdale under $50,000',
   '{"category":"land","city":"Harare","area":"Borrowdale","max_price":50000,"min_size":400}');

insert into public.conversations (id, property_id, customer_id, provider_id, created_at, last_message_at, customer_last_read_at, provider_last_read_at)
values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', 'epoch');
insert into public.messages (conversation_id, sender_id, body, created_at) values
  ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Hello, is this property still available?', now() - interval '2 days'),
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Yes, it is.', now() - interval '1 day 23 hours'),
  ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Could I arrange a viewing?', now() - interval '1 day 22 hours');

insert into public.reports (property_id, reporter_id, reason, details) values
  ('e0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'incorrect_information',
   'The listing says water is available but neighbours say there is no connection yet.');

drop table seed_props;
