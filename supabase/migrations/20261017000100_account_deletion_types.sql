-- =============================================================================
-- Pulshift · In-app account deletion request · types
-- Separate migration: the enum value must be committed before use.
-- =============================================================================

alter type public.notification_type add value if not exists 'account_deletion_requested';
