-- =============================================================================
-- Pulshift · Diensttausch · types
--
-- Separate migration on purpose: new enum values must be committed before
-- functions or rows can use them.
-- =============================================================================

alter type public.notification_type add value if not exists 'swap_requested';  -- → colleague asked
alter type public.notification_type add value if not exists 'swap_pending';    -- → ward lead: please approve
alter type public.notification_type add value if not exists 'swap_declined';   -- → requester: colleague said no
alter type public.notification_type add value if not exists 'swap_approved';   -- → both: lead approved, roster changed
alter type public.notification_type add value if not exists 'swap_rejected';   -- → both: lead rejected

create type public.shift_swap_status as enum (
  'pending_partner',  -- waiting for the colleague
  'pending_lead',     -- colleague agreed, waiting for the ward lead
  'approved',         -- lead approved, roster changed
  'declined',         -- colleague said no
  'rejected',         -- lead said no
  'cancelled'         -- requester withdrew
);
