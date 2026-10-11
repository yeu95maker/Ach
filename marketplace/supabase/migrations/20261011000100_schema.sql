-- =============================================================================
-- Property marketplace – core schema
--
-- Public reads of listings never touch these tables directly: anonymous and
-- signed-in customers go through the security-definer API in
-- 20261011000400_api.sql, which masks members-only / early-access listings
-- (price, gallery, description, provider) for non-premium users. The tables
-- themselves are only readable by their owners and by administrators.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in `private`, which is NOT exposed through the API.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.property_category   as enum ('apartment', 'house', 'land', 'commercial');
create type public.property_status     as enum ('draft', 'pending', 'active', 'rejected', 'removed', 'sold');
create type public.provider_type       as enum ('private_seller', 'owner', 'agent', 'developer', 'company');
create type public.provider_status     as enum ('unverified', 'pending', 'verified', 'rejected', 'suspended');
create type public.verification_status as enum ('pending', 'approved', 'rejected');
create type public.property_feature    as enum ('garage', 'garden', 'parking', 'balcony', 'terrace', 'pool', 'electricity', 'water', 'road_access');
create type public.nearby_kind         as enum ('school', 'shopping', 'hospital', 'main_road', 'transport', 'other');
create type public.report_reason       as enum ('scam', 'incorrect_information', 'not_available', 'duplicate', 'suspicious_provider', 'other');
create type public.report_status       as enum ('open', 'resolved', 'dismissed');
create type public.membership_status   as enum ('active', 'canceled', 'expired', 'past_due');
create type public.billing_interval    as enum ('month', 'year');
create type public.payment_status      as enum ('pending', 'succeeded', 'failed', 'refunded');

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                    boolean primary key default true check (id),
  currency              char(3)      not null default 'USD',
  premium_price_month   numeric(10, 2) not null default 9,
  premium_price_year    numeric(10, 2) not null default 90,
  free_favorites_limit  int          not null default 10 check (free_favorites_limit >= 0),
  early_access_hours    int          not null default 48 check (early_access_hours between 1 and 720),
  -- Demo checkout activates premium without a payment provider. NEVER enable in production.
  demo_billing          boolean      not null default false,
  updated_at            timestamptz  not null default now()
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null default '' check (char_length(full_name) <= 120),
  locale       text not null default 'en' check (locale in ('en', 'de')),
  is_admin     boolean not null default false,
  is_suspended boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Providers (Anbieter) and their verification
-- ---------------------------------------------------------------------------
create table public.providers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null unique references public.profiles (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 120),
  provider_type public.provider_type not null,
  country       text not null default 'Zimbabwe' check (char_length(country) between 2 and 80),
  city          text not null default 'Harare' check (char_length(city) between 2 and 80),
  about         text not null default '' check (char_length(about) <= 2000),
  logo_path     text check (char_length(logo_path) <= 300),
  status        public.provider_status not null default 'unverified',
  status_note   text check (char_length(status_note) <= 1000),
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index providers_status_idx on public.providers (status);

-- Private: never exposed publicly. Contact data stays with the platform because
-- all communication between customers and providers happens in-app.
create table public.provider_verifications (
  id                           uuid primary key default gen_random_uuid(),
  provider_id                  uuid not null references public.providers (id) on delete cascade,
  legal_name                   text not null check (char_length(legal_name) between 2 and 160),
  contact_phone                text not null check (char_length(contact_phone) between 5 and 40),
  contact_email                text not null check (contact_email ~ '^[^@\s]+@[^@\s]+$'),
  id_document_type             text not null check (id_document_type in ('national_id', 'passport', 'drivers_license')),
  id_document_number           text not null check (char_length(id_document_number) between 3 and 60),
  business_name                text check (char_length(business_name) <= 160),
  business_registration_number text check (char_length(business_registration_number) <= 80),
  agent_license_number         text check (char_length(agent_license_number) <= 80),
  document_paths               text[] not null default '{}' check (cardinality(document_paths) <= 10),
  status                       public.verification_status not null default 'pending',
  reviewer_id                  uuid references public.profiles (id) on delete set null,
  review_note                  text check (char_length(review_note) <= 1000),
  reviewed_at                  timestamptz,
  created_at                   timestamptz not null default now()
);
create index provider_verifications_provider_idx on public.provider_verifications (provider_id, created_at desc);
create index provider_verifications_pending_idx on public.provider_verifications (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references public.providers (id) on delete cascade,
  category            public.property_category not null,
  title               text not null check (char_length(title) between 5 and 140),
  description         text not null default '' check (char_length(description) <= 5000),
  country             text not null default 'Zimbabwe' check (char_length(country) between 2 and 80),
  city                text not null check (char_length(city) between 2 and 80),
  area                text not null check (char_length(area) between 2 and 80),
  -- Exact position: only visible to the provider and admins.
  latitude            double precision not null check (latitude between -90 and 90),
  longitude           double precision not null check (longitude between -180 and 180),
  -- Public position: approximate (~500 m) unless the provider opts in to the exact one.
  approx_latitude     double precision,
  approx_longitude    double precision,
  show_exact_location boolean not null default false,
  price               numeric(14, 2) not null check (price > 0),
  currency            char(3) not null default 'USD',
  land_size_m2        numeric(12, 2) check (land_size_m2 > 0),
  living_area_m2      numeric(10, 2) check (living_area_m2 > 0),
  bedrooms            smallint check (bedrooms between 0 and 50),
  bathrooms           smallint check (bathrooms between 0 and 50),
  parking_spaces      smallint check (parking_spaces between 0 and 500),
  status              public.property_status not null default 'draft',
  moderation_note     text check (char_length(moderation_note) <= 1000),
  -- Members-only (exclusive) listing: set by admins.
  is_premium          boolean not null default false,
  -- Premium early access: free users see a locked teaser until this moment.
  early_access_until  timestamptz,
  view_count          int not null default 0,
  submitted_at        timestamptz,
  published_at        timestamptz,
  last_confirmed_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint properties_size_present check (land_size_m2 is not null or living_area_m2 is not null)
);
create index properties_public_idx   on public.properties (category, published_at desc) where status = 'active';
create index properties_location_idx on public.properties (lower(city), lower(area)) where status = 'active';
create index properties_price_idx    on public.properties (price) where status = 'active';
create index properties_geo_idx      on public.properties (approx_latitude, approx_longitude) where status = 'active';
create index properties_provider_idx on public.properties (provider_id, created_at desc);
create index properties_pending_idx  on public.properties (submitted_at) where status = 'pending';

create table public.property_features (
  property_id uuid not null references public.properties (id) on delete cascade,
  feature     public.property_feature not null,
  primary key (property_id, feature)
);
create index property_features_feature_idx on public.property_features (feature, property_id);

create table public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 3 and 400),
  position     smallint not null default 0 check (position between 0 and 99),
  created_at   timestamptz not null default now()
);
create index property_images_property_idx on public.property_images (property_id, position, created_at);

create table public.property_nearby (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind        public.nearby_kind not null,
  name        text not null check (char_length(name) between 2 and 120),
  distance_m  int not null check (distance_m between 0 and 200000)
);
create index property_nearby_property_idx on public.property_nearby (property_id, distance_m);

-- One row per property, viewer and day: protects the view counter from refresh spam.
create table public.property_view_events (
  property_id uuid not null references public.properties (id) on delete cascade,
  viewer_key  text not null check (char_length(viewer_key) between 8 and 80),
  viewed_on   date not null default current_date,
  primary key (property_id, viewer_key, viewed_on)
);

-- ---------------------------------------------------------------------------
-- Customers: favorites, saved searches, notifications
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);
create index favorites_property_idx on public.favorites (property_id);

create table public.saved_searches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  filters          jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  alerts_enabled   boolean not null default true,
  last_notified_at timestamptz,
  created_at       timestamptz not null default now()
);
create index saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in (
               'saved_search_match', 'favorite_price_drop', 'favorite_unavailable',
               'provider_verified', 'provider_rejected', 'provider_suspended',
               'property_approved', 'property_rejected', 'property_removed',
               'new_inquiry', 'confirm_availability', 'membership')),
  title      text not null check (char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 1000),
  link       text check (char_length(link) <= 300),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Messaging: one conversation per property and customer
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties (id) on delete cascade,
  customer_id           uuid not null references public.profiles (id) on delete cascade,
  provider_id           uuid not null references public.providers (id) on delete cascade,
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz not null default now(),
  customer_last_read_at timestamptz not null default now(),
  provider_last_read_at timestamptz not null default 'epoch',
  unique (property_id, customer_id)
);
create index conversations_customer_idx on public.conversations (customer_id, last_message_at desc);
create index conversations_provider_idx on public.conversations (provider_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Memberships & payments (payment-provider agnostic)
-- ---------------------------------------------------------------------------
create table public.memberships (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  status                   public.membership_status not null default 'active',
  billing_interval         public.billing_interval not null default 'month',
  current_period_start     timestamptz not null default now(),
  current_period_end       timestamptz not null,
  cancel_at_period_end     boolean not null default false,
  payment_provider         text not null default 'manual' check (char_length(payment_provider) <= 40),
  external_customer_id     text check (char_length(external_customer_id) <= 200),
  external_subscription_id text check (char_length(external_subscription_id) <= 200),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  amount             numeric(10, 2) not null check (amount >= 0),
  currency           char(3) not null,
  status             public.payment_status not null,
  payment_provider   text not null check (char_length(payment_provider) <= 40),
  external_reference text check (char_length(external_reference) <= 200),
  billing_interval   public.billing_interval,
  period_start       timestamptz,
  period_end         timestamptz,
  created_at         timestamptz not null default now(),
  unique (payment_provider, external_reference)
);
create index payments_user_idx on public.payments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trust & safety
-- ---------------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id) on delete cascade,
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  reason          public.report_reason not null,
  details         text not null default '' check (char_length(details) <= 2000),
  status          public.report_status not null default 'open',
  resolution_note text check (char_length(resolution_note) <= 1000),
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_property_idx on public.reports (property_id);
