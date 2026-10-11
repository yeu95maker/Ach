-- =============================================================================
-- ShiftCare · Stationschat · permission
-- Separate migration so the permission exists before policies reference it.
-- =============================================================================

insert into public.permissions (key, scope, category, description) values
  ('chat.moderate', 'hospital', 'communication', 'Read the ward chats in scope and hide messages there');

-- Stationsleitung / PDL (head_nurse) and their deputies moderate the ward chats
-- in their scope. The hospital administration deliberately does not: it can
-- configure the tenant but does not read team conversations.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'chat.moderate'
from public.roles r
where r.key in ('head_nurse', 'deputy_head_nurse') and r.hospital_id is null
on conflict do nothing;
