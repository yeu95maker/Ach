-- =============================================================================
-- Minimal Supabase platform shim for plain PostgreSQL (CI / local tests only).
--
-- Recreates the parts of a Supabase database that the Dienstwerk migrations
-- depend on: API roles, auth.uid()/auth.jwt(), auth.users/identities,
-- storage.buckets/objects + storage.foldername(), vault, the realtime
-- publication and Supabase's default privileges.
-- NEVER run this against a real Supabase project.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin noinherit bypassrls; end if;
end;
$$;

grant anon, authenticated, service_role to postgres;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id          uuid,
  id                   uuid primary key,
  aud                  varchar(255),
  role                 varchar(255),
  email                varchar(255),
  encrypted_password   varchar(255),
  email_confirmed_at   timestamptz,
  confirmation_token   varchar(255),
  recovery_token       varchar(255),
  email_change_token_new varchar(255),
  email_change         varchar(255),
  raw_app_meta_data    jsonb,
  raw_user_meta_data   jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table if not exists auth.identities (
  id              uuid primary key default gen_random_uuid(),
  provider_id     text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- vault (plain-text store – the real Vault encrypts secrets at rest)
-- ---------------------------------------------------------------------------
create schema if not exists vault;

create table if not exists vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  description text,
  secret      text not null,
  created_at  timestamptz default now()
);

create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at from vault.secrets;

create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id
$$;

-- ---------------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supabase default privileges on the public schema
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
