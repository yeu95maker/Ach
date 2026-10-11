-- =============================================================================
-- Extra demo content for the store screenshots only (applied by
-- scripts/store/screenshots.mjs to a freshly seeded database).
-- =============================================================================

-- Documents / SOPs for Station 3A (published; one with read confirmation)
insert into public.documents (id, hospital_id, unit_id, category, title, description, requires_ack, file_name, mime_type,
                              size_bytes, visibility, version, published_at, storage_path)
values
  ('70000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'sop', 'SOP Händedesinfektion', 'Neue Einwirkzeiten ab Montag. Bitte bis Freitag lesen und bestätigen.', true,
   'sop-haendedesinfektion-v2.pdf', 'application/pdf', 182000, 'unit', 2, now() - interval '3 hours', 'x'),
  ('70000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'checklist', 'Checkliste Notfallwagen', null, false,
   'checkliste-notfallwagen.pdf', 'application/pdf', 64000, 'unit', 1, now() - interval '9 days', 'x'),
  ('70000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'guideline', 'Richtlinie Sturzprophylaxe', 'Expertenstandard, Fassung 2026.', true,
   'richtlinie-sturzprophylaxe.pdf', 'application/pdf', 240000, 'unit', 1, now() - interval '12 days', 'x');
insert into storage.objects (bucket_id, name)
select 'documents', storage_path from public.documents where id::text like '70000000-%';
insert into public.document_acknowledgements (hospital_id, document_id, employee_id, acknowledged_at) values
  ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', now() - interval '2 hours'),
  ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', now() - interval '1 hour'),
  ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000001', now() - interval '10 days'),
  ('10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000002', now() - interval '11 days');

-- Mandatory trainings
insert into public.training_requirements (id, hospital_id, unit_id, title, description, interval_months, created_at) values
  ('71000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Reanimationstraining (BLS)', 'Jährlich, Simulationszentrum Haus C', 12, now() - interval '200 days'),
  ('71000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', null,
   'Brandschutzunterweisung', null, 12, now() - interval '200 days'),
  ('71000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Hygieneschulung', 'E-Learning und Präsenztermin', 24, now() - interval '200 days');
insert into public.training_completions (hospital_id, requirement_id, employee_id, completed_on, valid_until, verified_at) values
  ('10000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', current_date - 330, current_date + 35, now()),
  ('10000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001', current_date - 90, current_date + 275, now()),
  ('10000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', current_date - 40, current_date + 325, now()),
  ('10000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000002', current_date - 200, current_date + 530, null),
  ('10000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000004', current_date - 20, current_date + 345, now()),
  ('10000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', current_date - 400, current_date - 35, now());

-- A swap Anna ↔ Jonas waiting for the ward lead
insert into public.shift_swaps (hospital_id, unit_id, requester_id, requester_entry_id, partner_id, partner_entry_id, note, status, responded_at)
select '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
       '40000000-0000-4000-a000-000000000001', a.id, '40000000-0000-4000-a000-000000000002', j.id,
       'Familienfeier am Wochenende', 'pending_lead', now() - interval '20 minutes'
from public.schedule_entries a
join public.schedules sa on sa.id = a.schedule_id and sa.status = 'published'
join lateral (
  select o.id from public.schedule_entries o
  join public.schedules so on so.id = o.schedule_id and so.status = 'published'
  where o.employee_id = '40000000-0000-4000-a000-000000000002' and o.kind = 'shift'
    and o.entry_date between a.entry_date + 1 and a.entry_date + 10
    and not private.swap_is_hard(private.swap_issues('40000000-0000-4000-a000-000000000001', o.id, a.id))
    and not private.swap_is_hard(private.swap_issues('40000000-0000-4000-a000-000000000002', a.id, o.id))
  order by o.entry_date limit 1) j on true
where a.employee_id = '40000000-0000-4000-a000-000000000001' and a.kind = 'shift' and a.starts_at > now() + interval '2 days'
order by a.starts_at
limit 1;
