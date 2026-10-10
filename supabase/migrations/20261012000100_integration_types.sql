-- =============================================================================
-- ShiftCare · Integration Hub · types and permissions
-- Separate migration: enum values must be committed before use.
-- =============================================================================

-- How a source system is connected. Only 'file' (CSV/XLSX upload) is
-- implemented; the others are reserved for future adapters.
create type public.integration_kind as enum ('file', 'api', 'sftp');

create type public.import_run_status as enum (
  'staged',      -- rows stored and validated, nothing written to the roster yet
  'applied',     -- written into the (draft or published) roster
  'published',   -- the roster containing this import was published
  'failed',      -- applying failed; nothing was changed
  'cancelled',   -- discarded by the user
  'superseded'   -- a newer import of the same ward/period was applied first
);

create type public.import_row_status as enum ('ok', 'warning', 'error', 'ignored');

insert into public.permissions (key, scope, category, description) values
  ('schedule.import',      'hospital', 'schedule',       'Import rosters from external systems for wards in scope'),
  ('integrations.manage',  'hospital', 'administration', 'Configure integrations (import profiles, mappings, credentials)');

-- Stationsleitung, Stellvertretung und PDL importieren; die Krankenhaus-Administration konfiguriert.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join (values ('head_nurse', 'schedule.import'), ('deputy_head_nurse', 'schedule.import'), ('hospital_admin', 'integrations.manage'))
  as p(role_key, key) on p.role_key = r.key
where r.hospital_id is null
on conflict do nothing;
