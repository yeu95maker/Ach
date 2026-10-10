-- =============================================================================
-- ShiftCare · Wunschplan (1/2) · Typen
--
-- Separate migration on purpose: new enum values must be committed before
-- functions or rows use them (ALTER TYPE … ADD VALUE inside a transaction).
-- =============================================================================

alter type public.notification_type add value if not exists 'wish_plan_opened';
alter type public.notification_type add value if not exists 'wish_plan_deadline';
alter type public.notification_type add value if not exists 'wish_plan_submitted';
alter type public.notification_type add value if not exists 'wish_plan_locked';
alter type public.notification_type add value if not exists 'wish_plan_reviewed';

-- Lifecycle of a wish period (per ward and scheduling period)
--   draft → open → locked → (open again = reopened) … → archived
create type public.wish_period_status as enum ('draft', 'open', 'locked', 'archived');

-- Status of every single wish
create type public.wish_status as enum ('submitted', 'under_review', 'considered', 'not_considered', 'locked');

-- Origin of a schedule suggestion (prepared for AI-assisted scheduling)
create type public.suggestion_status as enum ('proposed', 'accepted', 'rejected', 'superseded');
