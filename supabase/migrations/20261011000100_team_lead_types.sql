-- =============================================================================
-- ShiftCare · Team lead features · types
--
-- Separate migration on purpose: new enum values must be committed before
-- functions or rows can use them.
-- =============================================================================

-- Someone is interested in an open shift → ward management.
alter type public.notification_type add value if not exists 'open_shift_interest';

-- "Aktuelles": what an announcement is about.
create type public.announcement_category as enum (
  'information',        -- Neue Information
  'training',           -- Fortbildung
  'further_education',  -- Weiterbildung
  'workshop',           -- Workshop
  'team_meeting',       -- Teamsitzung
  'doctor_meeting',     -- Gespräch mit Ärztinnen und Ärzten
  'other'               -- Sonstiges
);

create type public.open_shift_interest_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
