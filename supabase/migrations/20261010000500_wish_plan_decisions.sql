-- =============================================================================
-- ShiftCare · Wunschplan · Entscheidungen des Fachbereichs (2026-10-10)
--
-- 1. Einreichen dürfen Pflegekräfte (auch als Schichtleitung), die
--    Stationsleitung und die stellvertretende Stationsleitung – nicht HR.
-- 2. Neue Systemrolle "deputy_head_nurse" = stellvertretende Stationsleitung.
--    Annahme (siehe docs/OPEN_POINTS.md): vertritt die Stationsleitung und hat
--    daher dieselben Rechte; Zuweisung mit Scope Station.
-- 3. "Nicht verfügbar" bleibt ein starker Wunsch, kein harter Ausschluss
--    (keine Schemaänderung nötig).
-- 4. Standardwerte bleiben: Frist 21 Tage vor Zeitraum, Erinnerung 3 Tage vor
--    Frist, kein Limit für Wunschfrei.
-- =============================================================================

-- 1. HR reicht keinen Wunschplan ein
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.key = 'hr' and r.hospital_id is null
  and rp.permission_key = 'wishes.submit';

-- 2. Stellvertretende Stationsleitung
insert into public.roles (key, name, description, scope, is_system, sort_order)
values ('deputy_head_nurse', 'Deputy Head Nurse', 'Stellvertretende Stationsleitung', 'hospital', true, 25)
on conflict (hospital_id, key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select deputy.id, rp.permission_key
from public.roles deputy
join public.roles head on head.key = 'head_nurse' and head.hospital_id is null
join public.role_permissions rp on rp.role_id = head.id
where deputy.key = 'deputy_head_nurse' and deputy.hospital_id is null
on conflict do nothing;

-- 4. Explicit defaults on the configuration table (documentation + safety)
alter table public.wish_plan_settings alter column max_free_wishes set default null;
comment on column public.wish_plan_settings.max_free_wishes is 'NULL = kein Limit (Standard).';
