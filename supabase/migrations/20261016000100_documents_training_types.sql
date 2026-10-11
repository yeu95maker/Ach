-- =============================================================================
-- Pulshift · Dokumente (SOPs, Lesebestätigung) + Pflichtfortbildungen · types
--
-- Separate migration on purpose: new enum values and permissions must be
-- committed before functions, policies or rows use them.
-- =============================================================================

alter type public.notification_type add value if not exists 'document_published';  -- new SOP / document for my ward
alter type public.notification_type add value if not exists 'document_reminder';   -- please confirm you have read it
alter type public.notification_type add value if not exists 'training_assigned';   -- new mandatory training applies to me
alter type public.notification_type add value if not exists 'training_due';        -- missing, expired or due soon

insert into public.permissions (key, scope, category, description) values
  ('training.manage', 'hospital', 'employees', 'Define mandatory trainings and record / confirm completions in scope');

-- Stationsleitung / PDL and deputies (scoped like their role), HR and the
-- hospital administration (hospital-wide).
insert into public.role_permissions (role_id, permission_key)
select r.id, 'training.manage'
from public.roles r
where r.key in ('head_nurse', 'deputy_head_nurse', 'hr', 'hospital_admin') and r.hospital_id is null
on conflict do nothing;

-- The deputy also manages ward documents like the head nurse (role copy was
-- made before documents.manage mattered for wards; keep it explicit).
insert into public.role_permissions (role_id, permission_key)
select r.id, 'documents.manage'
from public.roles r
where r.key = 'deputy_head_nurse' and r.hospital_id is null
on conflict do nothing;
