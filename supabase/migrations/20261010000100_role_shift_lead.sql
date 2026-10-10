-- =============================================================================
-- ShiftCare · 1300 · Role semantics: Charge Nurse = Schichtleitung
--
-- Decision (product owner, 2026-10-10): "Charge Nurse" is the SHIFT LEAD, not
-- the ward manager.
--
--   charge_nurse  Schichtleitung       nurse + sees sick periods (without
--                                      medical comment) and team contact
--                                      details to organise the running shift.
--                                      No approvals, no publishing.
--   head_nurse    Stationsleitung      assigned with unit scope
--                 Pflegedienstleitung  same role, department / hospital scope
--
-- Only built-in role data changes; schema and policies stay untouched because
-- everything is permission based.
-- =============================================================================

update public.roles set name = 'Charge Nurse', description = 'Schichtleitung'
 where key = 'charge_nurse' and hospital_id is null;

update public.roles set name = 'Head Nurse', description = 'Stationsleitung (Station) / Pflegedienstleitung (Abteilung, Haus)'
 where key = 'head_nurse' and hospital_id is null;

-- Charge nurse: remove ward-management rights …
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.key = 'charge_nurse' and r.hospital_id is null
  and rp.permission_key in (
    'schedule.view_drafts', 'schedule.manage', 'schedule.publish',
    'leave.view', 'leave.approve',
    'sick_leave.view_details',
    'announcements.publish');

-- … and keep exactly what a shift lead needs on top of the nurse rights.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('schedule.view'), ('team.view'), ('leave.request'), ('sick_leave.report'),
                   ('documents.view'), ('sick_leave.view'), ('employees.view')) as p(key)
where r.key = 'charge_nurse' and r.hospital_id is null
on conflict do nothing;
