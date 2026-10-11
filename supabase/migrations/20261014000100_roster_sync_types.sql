-- =============================================================================
-- Pulshift · Automatische Synchronisierung · types
-- Separate migration: enum values must be committed before use.
-- =============================================================================

-- A new roster version arrived from the hospital's planning system and waits
-- for the ward lead's confirmation.
alter type public.notification_type add value if not exists 'roster_sync';
