-- =============================================================================
-- ShiftCare · 0100 · Foundation
-- Extensions, schemas, enum types and generic trigger helpers.
-- =============================================================================

create extension if not exists pgcrypto   with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- `private` holds security-definer helpers used by RLS policies and triggers.
-- It is NOT exposed through the Data API (PostgREST only serves `public`).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enum types (closed value sets that the application logic switches on).
-- Open, tenant-configurable sets (roles, permissions, shift types,
-- qualifications) are modelled as tables instead.
-- -----------------------------------------------------------------------------
create type public.employment_type     as enum ('full_time', 'part_time', 'marginal', 'trainee', 'agency', 'other');
create type public.employee_status     as enum ('active', 'inactive');
create type public.language_proficiency as enum ('native', 'fluent', 'intermediate', 'basic');
create type public.role_scope          as enum ('hospital', 'platform');
create type public.shift_category      as enum ('early', 'late', 'night', 'day', 'other');
create type public.schedule_status     as enum ('draft', 'published', 'archived');
create type public.schedule_entry_kind as enum ('shift', 'off');
create type public.leave_type          as enum ('vacation', 'special', 'unpaid', 'training', 'overtime_compensation');
create type public.request_status      as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.sick_leave_status   as enum ('reported', 'acknowledged', 'closed', 'cancelled');
create type public.notification_type   as enum (
  'schedule_published',
  'schedule_changed',
  'open_shift',
  'leave_requested',
  'leave_approved',
  'leave_rejected',
  'sick_leave_reported',
  'sick_leave_updated',
  'announcement',
  'message'
);
create type public.delivery_channel    as enum ('push', 'email');
create type public.delivery_status     as enum ('queued', 'sent', 'failed', 'skipped');
create type public.device_platform     as enum ('web', 'ios', 'android');
create type public.document_visibility as enum ('private', 'unit', 'hospital');
create type public.announcement_priority as enum ('normal', 'important');

-- -----------------------------------------------------------------------------
-- Generic trigger: maintain updated_at.
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Functions in `private` are not executable by default; each migration grants
-- EXECUTE explicitly to the roles that need it (least privilege).
alter default privileges in schema private revoke execute on functions from public;
